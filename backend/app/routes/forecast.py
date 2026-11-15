"""
Forecast router: thin. No business rules here, only HTTP wiring and branch scoping.
Errors (NotFoundError, ConflictError, ...) are turned into HTTP responses
by your global exception handlers.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.dependencies import get_current_user, require_admin
from app.core.device import get_device_info
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.crud import forecast as crud
from app.models.forecast import SuggestionStatus, Urgency
from app.models.users import UserModel
from app.schemas.forecast import ForecastRead, RunRequest, RunResult, SuggestionDecision
from app.schemas.forecast_view import SuggestionView, SuggestionViewList

router = APIRouter(prefix="", tags=["forecast"])

# A branch admin can recalculate their branch at most this often (super admins are not limited)
RUN_COOLDOWN_MINUTES = 5


def _role(user: UserModel) -> str:
    return str(getattr(user.role, "value", user.role))


def _branch_scope(actor: UserModel, branch_id: Optional[uuid.UUID]) -> uuid.UUID:
    """Super admin: any branch (must choose one). Everyone else: their own branch only."""
    if _role(actor) == "SUPER_ADMIN":
        if not branch_id:
            raise BadRequestError("Choose a branch", code="branch_required")
        return branch_id
    if not actor.branch_id:
        raise ForbiddenError("Your account has no branch", code="no_branch")
    if branch_id and branch_id != actor.branch_id:
        raise ForbiddenError("You can only use your own branch", code="branch_forbidden")
    return actor.branch_id


def _ensure_in_scope(actor: UserModel, suggestion) -> None:
    """Same answer as a missing suggestion, so ids of other branches do not leak."""
    if _role(actor) == "SUPER_ADMIN":
        return
    if not actor.branch_id or suggestion.branch_id != actor.branch_id:
        raise NotFoundError("Suggestion not found", code="suggestion_not_found")


def _view(actor: UserModel, row) -> SuggestionView:
    view = SuggestionView.model_validate(row)
    if _role(actor) == "SELLER":        # managers' notes are internal
        view.decision_note = None
        view.decided_by = None
    return view


# ---------------- actions: super admin and branch admin ----------------
@router.post("/run", response_model=RunResult)
async def run_forecast(
    payload: RunRequest,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(require_admin),
    device: dict = Depends(get_device_info),
):
    """Recalculate reorder suggestions for one branch (replaces its pending ones)."""
    branch_id = _branch_scope(actor, payload.branch_id)

    if _role(actor) != "SUPER_ADMIN":
        latest = await crud.latest_pending_at(db, branch_id)
        if latest is not None:
            latest = latest if latest.tzinfo else latest.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - latest < timedelta(minutes=RUN_COOLDOWN_MINUTES):
                raise ConflictError(
                    f"Suggestions were calculated a moment ago. Try again in {RUN_COOLDOWN_MINUTES} minutes.",
                    code="run_too_soon",
                )

    return await crud.run_for_branch(db, branch_id, actor=actor, device=device)


async def _decide(db, actor, device, suggestion_id, new_status, note) -> SuggestionView:
    existing = await crud.get_suggestion_or_404(db, suggestion_id)
    _ensure_in_scope(actor, existing)
    await crud.decide(db, suggestion_id, new_status, note, actor=actor, device=device)
    return _view(actor, await crud.get_suggestion_or_404(db, suggestion_id))  # reload after the commit


@router.post("/suggestions/{suggestion_id}/approve", response_model=SuggestionView)
async def approve_suggestion(
    suggestion_id: uuid.UUID,
    payload: SuggestionDecision,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(require_admin),
    device: dict = Depends(get_device_info),
):
    return await _decide(db, actor, device, suggestion_id, SuggestionStatus.APPROVED, payload.note)


@router.post("/suggestions/{suggestion_id}/dismiss", response_model=SuggestionView)
async def dismiss_suggestion(
    suggestion_id: uuid.UUID,
    payload: SuggestionDecision,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(require_admin),
    device: dict = Depends(get_device_info),
):
    return await _decide(db, actor, device, suggestion_id, SuggestionStatus.DISMISSED, payload.note)


# ---------------- reads: everyone, in their own branch ----------------
@router.get("/suggestions", response_model=SuggestionViewList)
async def list_suggestions(
    branch_id: Optional[uuid.UUID] = None,   # optional for branch admins and sellers
    status: Optional[SuggestionStatus] = Query(SuggestionStatus.PENDING),
    urgency: Optional[Urgency] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
):
    branch = _branch_scope(actor, branch_id)
    rows, total = await crud.list_suggestions(
        db, branch_id=branch, status_=status, urgency=urgency, skip=skip, limit=limit
    )
    return SuggestionViewList(
        items=[_view(actor, r) for r in rows], total=total, skip=skip, limit=limit
    )


@router.get("/suggestions/{suggestion_id}", response_model=SuggestionView)
async def get_suggestion(
    suggestion_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
):
    s = await crud.get_suggestion_or_404(db, suggestion_id)
    _ensure_in_scope(actor, s)
    return _view(actor, s)


@router.get("/product/{product_id}", response_model=ForecastRead)
async def product_forecast(
    product_id: uuid.UUID,
    branch_id: Optional[uuid.UUID] = None,
    horizon: int = Query(14, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
):
    """Live demand forecast for one product in one branch (units only, no money)."""
    return await crud.product_forecast(db, product_id, _branch_scope(actor, branch_id), horizon)