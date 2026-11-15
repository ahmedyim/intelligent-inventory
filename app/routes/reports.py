import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.crud import reports as crud
from app.models.users import UserModel
from app.schemas.reports import BranchRevenue, ReportPeriod, SalesTrend, SummaryReport, TrendGranularity
from datetime import date, datetime
from typing import Literal

from fastapi import Response
from starlette.concurrency import run_in_threadpool

from app.core.device import get_device_info
from app.core.exceptions import BadRequestError
from app.crud import report_files, report_tables
from app.crud.activity_logs import add_activity
from app.crud.reports import REPORT_TZ
from app.schemas.report_tables import ReportKey, ReportTable
from app.schemas.sales import SalesPeriod
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


def _table_filters(actor, period, date_from, date_to, branch_id, created_by, payment_method):
    if date_from and date_to and date_from > date_to:
        raise BadRequestError("The start date is after the end date", code="invalid_date_range")
    return report_tables.Filters(
        period=period, date_from=date_from, date_to=date_to,
        branch_id=_scope(actor, branch_id),   # branch admins are locked to their own branch
        staff_id=created_by, method=payment_method,
    )


@router.get("/tables/{key}", response_model=ReportTable)
async def report_table(
    key: ReportKey,
    period: SalesPeriod = Query(SalesPeriod.month),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    branch_id: Optional[uuid.UUID] = None,
    created_by: Optional[uuid.UUID] = None,
    payment_method: Optional[str] = Query(None, max_length=50),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
):
    f = _table_filters(actor, period, date_from, date_to, branch_id, created_by, payment_method)
    return await report_tables.build_report(db, key, f, skip=skip, limit=limit)


@router.get("/tables/{key}/export")
async def export_report(
    key: ReportKey,
    fmt: Literal["xlsx", "csv"] = Query("xlsx", alias="format"),
    period: SalesPeriod = Query(SalesPeriod.month),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    branch_id: Optional[uuid.UUID] = None,
    created_by: Optional[uuid.UUID] = None,
    payment_method: Optional[str] = Query(None, max_length=50),
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Download the whole report (up to 20,000 rows) as Excel or CSV."""
    f = _table_filters(actor, period, date_from, date_to, branch_id, created_by, payment_method)
    table = await report_tables.build_report(db, key, f, skip=0, limit=None)

    if fmt == "csv":
        content, media = report_files.to_csv(table), "text/csv; charset=utf-8"
    else:
        content = await run_in_threadpool(report_files.to_xlsx, table, actor.full_name)  # CPU work
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    # exports contain cost and profit: leave a trail
    add_activity(
        db, action="report.exported", actor=actor, branch_id=f.branch_id,
        description=f"Exported {table.title} as {fmt.upper()} ({len(table.rows)} rows)",
        meta={"report": key.value, "format": fmt, "rows": len(table.rows), "filters": table.filters},
        device=device,
    )
    await db.commit()

    filename = f"{key.value}-{datetime.now(REPORT_TZ):%Y%m%d-%H%M}.{fmt}"
    return Response(
        content=content, media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )



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