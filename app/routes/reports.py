import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.crud import reports as crud
from app.models.users import UserModel
from app.schemas.reports import BranchRevenue, ReportPeriod, SalesTrend, SummaryReport, TrendGranularity

router = APIRouter(prefix="", tags=["reports"])

def _role(user: UserModel) -> str:
    return str(getattr(user.role, "value", user.role))


def _scope(actor: UserModel, branch_id: Optional[uuid.UUID]) -> Optional[uuid.UUID]:
    """Super admin: all branches, or one via ?branch_id=. Branch admin: always their own
    branch (the client value is ignored). Sellers must not see cost and profit."""
    role = _role(actor)
    if role == "SUPER_ADMIN":
        return branch_id
    if role == "BRANCH_ADMIN":
        if not actor.branch_id:
            raise HTTPException(status_code=403, detail="Your account has no branch")
        return actor.branch_id
    raise HTTPException(status_code=403, detail="Not allowed")


@router.get("/summary", response_model=SummaryReport)
async def summary(
    period: ReportPeriod = Query(ReportPeriod.today),
    branch_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
):
    return await crud.get_summary(db, period, _scope(actor, branch_id))


@router.get("/trend", response_model=SalesTrend)
async def trend(
    granularity: TrendGranularity = Query(TrendGranularity.day),
    branch_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
):
    return await crud.get_trend(db, granularity, _scope(actor, branch_id))


@router.get("/by-branch", response_model=list[BranchRevenue])
async def by_branch(
    period: ReportPeriod = Query(ReportPeriod.month),
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
):
    """Revenue share per branch. Super admin only."""
    if _role(actor) != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Not allowed")
    return await crud.get_by_branch(db, period)