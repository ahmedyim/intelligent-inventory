"""
Forecast router: thin. No business rules here, only HTTP wiring.
Errors (NotFoundError, ConflictError, ...) are turned into HTTP responses
by your global exception handlers.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.dependencies import get_current_user, require_role
from app.core.device import get_device_info
from app.crud import forecast as crud
from app.models.forecast import SuggestionStatus, Urgency
from app.models.users import UserModel
from app.schemas.forecast import (
    ForecastRead,
    RunRequest,
    RunResult,
    SuggestionDecision,
    SuggestionList,
    SuggestionRead,
)
from app.schemas.users import UserRole

router = APIRouter(prefix="", tags=["forecast"])

# Who may recalculate and decide on suggestions. Add your manager role(s) here,
# e.g. require_role(UserRole.SUPER_ADMIN, UserRole.MANAGER) if yours accepts several.
manager_only = require_role(UserRole.SUPER_ADMIN)


# ---------------- actions ----------------
@router.post("/run", response_model=RunResult)
async def run_forecast(
    payload: RunRequest,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(manager_only),
    device: dict = Depends(get_device_info),
):
    """Recalculate reorder suggestions for one branch (replaces its pending ones)."""
    return await crud.run_for_branch(db, payload.branch_id, actor=actor, device=device)


@router.post("/suggestions/{suggestion_id}/approve", response_model=SuggestionRead)
async def approve_suggestion(
    suggestion_id: uuid.UUID,
    payload: SuggestionDecision,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(manager_only),
    device: dict = Depends(get_device_info),
):
    return await crud.decide(
        db, suggestion_id, SuggestionStatus.APPROVED, payload.note, actor=actor, device=device
    )


@router.post("/suggestions/{suggestion_id}/dismiss", response_model=SuggestionRead)
async def dismiss_suggestion(
    suggestion_id: uuid.UUID,
    payload: SuggestionDecision,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(manager_only),
    device: dict = Depends(get_device_info),
):
    return await crud.decide(
        db, suggestion_id, SuggestionStatus.DISMISSED, payload.note, actor=actor, device=device
    )


# ---------------- reads ----------------
@router.get("/suggestions", response_model=SuggestionList)
async def list_suggestions(
    branch_id: uuid.UUID,
    status: Optional[SuggestionStatus] = Query(SuggestionStatus.PENDING),
    urgency: Optional[Urgency] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    rows, total = await crud.list_suggestions(
        db, branch_id=branch_id, status_=status, urgency=urgency, skip=skip, limit=limit
    )
    return SuggestionList(
        items=[SuggestionRead.model_validate(r) for r in rows],
        total=total, skip=skip, limit=limit,
    )


@router.get("/suggestions/{suggestion_id}", response_model=SuggestionRead)
async def get_suggestion(
    suggestion_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    return await crud.get_suggestion_or_404(db, suggestion_id)


@router.get("/product/{product_id}", response_model=ForecastRead)
async def product_forecast(
    product_id: uuid.UUID,
    branch_id: uuid.UUID,
    horizon: int = Query(14, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    """Live demand forecast for one product in one branch."""
    return await crud.product_forecast(db, product_id, branch_id, horizon)