"""
Dashboard reports (read-only).

Definitions:
  sales_count     = completed sales (voided ones are excluded)
  revenue         = sum(Sale.total)                   (after discount)
  cost            = sum(SaleItem.unit_cost * qty)     (cost snapshot taken at sale time)
  profit          = revenue - cost
  inventory_value = sum(stock on hand * product cost price)
  low_stock       = products with 0 < quantity <= reorder_level
  out_of_stock    = products with quantity <= 0

A period is measured in the business timezone, so "today" starts at local midnight
and not at midnight UTC. The previous period is like-for-like: on the 3rd of the
month, "this month" (1st to now) is compared with the 1st to the 3rd of last month.
"""
import uuid
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import and_, case, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branches import BranchModel
from app.models.inventory import Inventory
from app.models.products import Product as ProductModel
from app.models.sales import Sale, SaleItem, SaleStatus
from app.schemas.reports import (
    BranchRevenue,
    PeriodTotals,
    ReportPeriod,
    SalesTrend,
    SummaryReport,
    TrendGranularity,
    TrendPoint,
)
REPORT_TZ = ZoneInfo("Africa/Addis_Ababa")
ZERO = Decimal("0")


def _money(value) -> float:
    return float(Decimal(value or 0).quantize(Decimal("0.01")))




def _windows(period: ReportPeriod, now: datetime):
    """Return ((start, end), (prev_start, prev_end)) in local time."""
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if period is ReportPeriod.today:
        start = today
        prev_start = today - timedelta(days=1)
    elif period is ReportPeriod.week:
        start = today - timedelta(days=today.weekday())  # Monday
        prev_start = start - timedelta(days=7)
    else:
        start = today.replace(day=1)
        prev_start = (start - timedelta(days=1)).replace(day=1)

    elapsed = now - start
    # Like-for-like. For the full previous period instead, use: prev_end = start
    prev_end = min(prev_start + elapsed, start)
    return (start, now), (prev_start, prev_end)


async def _period_totals(
    db: AsyncSession, start: datetime, end: datetime, branch_id: Optional[uuid.UUID]
) -> PeriodTotals:
    filters = [
        Sale.status == SaleStatus.COMPLETED,
        Sale.created_at >= start,
        Sale.created_at <= end,
    ]
    if branch_id:
        filters.append(Sale.branch_id == branch_id)

    count, revenue = (
        await db.execute(
            select(func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0)).where(*filters)
        )
    ).one()

    # Separate query: joining items into the first one would repeat Sale.total per item
    cost = (
        await db.execute(
            select(func.coalesce(func.sum(SaleItem.unit_cost * SaleItem.quantity), 0))
            .select_from(SaleItem)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(*filters)
        )
    ).scalar_one()

    revenue_d, cost_d = Decimal(revenue or 0), Decimal(cost or 0)
    return PeriodTotals(
        sales_count=count,
        revenue=_money(revenue_d),
        cost=_money(cost_d),
        profit=_money(revenue_d - cost_d),
    )


async def _stock_stats(db: AsyncSession, branch_id: Optional[uuid.UUID]) -> dict:
    inv_filters = [ProductModel.is_active.is_(True)]
    if branch_id:
        inv_filters.append(Inventory.branch_id == branch_id)

    value, low, out = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (Inventory.quantity > 0, Inventory.quantity * ProductModel.cost_price),
                            else_=0,
                        )
                    ),
                    0,
                ),
                func.count(
                    func.distinct(
                        case(
                            (
                                and_(
                                    Inventory.quantity > 0,
                                    Inventory.quantity <= ProductModel.reorder_level,
                                ),
                                Inventory.product_id,
                            )
                        )
                    )
                ),
                func.count(func.distinct(case((Inventory.quantity <= 0, Inventory.product_id)))),
            )
            .select_from(Inventory)
            .join(ProductModel, ProductModel.id == Inventory.product_id)
            .where(*inv_filters)
        )
    ).one()

    if branch_id:
        total_products = (
            await db.execute(
                select(func.count(func.distinct(Inventory.product_id)))
                .join(ProductModel, ProductModel.id == Inventory.product_id)
                .where(*inv_filters)
            )
        ).scalar_one()
    else:
        total_products = (
            await db.execute(
                select(func.count(ProductModel.id)).where(ProductModel.is_active.is_(True))
            )
        ).scalar_one()

    return {
        "total_products": total_products,
        "inventory_value": _money(value),
        "low_stock": low,
        "out_of_stock": out,
    }


async def get_summary(
    db: AsyncSession, period: ReportPeriod, branch_id: Optional[uuid.UUID] = None
) -> SummaryReport:
    now = datetime.now(REPORT_TZ)
    (start, end), (prev_start, prev_end) = _windows(period, now)

    current = await _period_totals(db, start, end, branch_id)
    previous = await _period_totals(db, prev_start, prev_end, branch_id)
    stock = await _stock_stats(db, branch_id)

    return SummaryReport(**current.model_dump(), previous=previous, **stock)
CREATED_AT_IS_NAIVE_UTC = True


def _to_db(dt: datetime) -> datetime:
    """A boundary in the form the column stores it."""
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if CREATED_AT_IS_NAIVE_UTC else dt


def _local(col):
    """Column -> local wall-clock time, so buckets follow the business day, not UTC.
    literal_column keeps the zone out of bind parameters; with parameters, Postgres
    can reject the GROUP BY because the SELECT and GROUP BY copies differ."""
    tz = literal_column(f"'{REPORT_TZ.key}'")
    if CREATED_AT_IS_NAIVE_UTC:
        return func.timezone(tz, func.timezone(literal_column("'UTC'"), col))
    return func.timezone(tz, col)


def _add_months(d, months: int):
    y, m = divmod(d.year * 12 + (d.month - 1) + months, 12)
    return d.replace(year=y, month=m + 1, day=1)


async def get_trend(
    db: AsyncSession, granularity: TrendGranularity, branch_id: Optional[uuid.UUID] = None
) -> SalesTrend:
    today = datetime.now(REPORT_TZ).date()

    if granularity is TrendGranularity.day:
        starts = [today - timedelta(days=13 - i) for i in range(14)]
    elif granularity is TrendGranularity.week:
        monday = today - timedelta(days=today.weekday())
        starts = [monday - timedelta(weeks=11 - i) for i in range(12)]
    else:
        first = today.replace(day=1)
        starts = [_add_months(first, -(11 - i)) for i in range(12)]

    range_start = datetime.combine(starts[0], time.min, tzinfo=REPORT_TZ)
    filters = [Sale.status == SaleStatus.COMPLETED, Sale.created_at >= _to_db(range_start)]
    if branch_id:
        filters.append(Sale.branch_id == branch_id)

    unit = literal_column(f"'{granularity.value}'")   # from the enum, never from user text

    def bucket():
        return func.date_trunc(unit, _local(Sale.created_at))

    revenue_rows = (
        await db.execute(
            select(bucket(), func.coalesce(func.sum(Sale.total), 0)).where(*filters).group_by(bucket())
        )
    ).all()
    cost_rows = (
        await db.execute(
            select(bucket(), func.coalesce(func.sum(SaleItem.unit_cost * SaleItem.quantity), 0))
            .select_from(SaleItem)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(*filters)
            .group_by(bucket())
        )
    ).all()

    revenue = {r[0].date(): Decimal(r[1]) for r in revenue_rows}
    cost = {r[0].date(): Decimal(r[1]) for r in cost_rows}

    points = []
    for d in starts:   # buckets without sales become zeros, so the chart has no gaps
        rev, cst = revenue.get(d, ZERO), cost.get(d, ZERO)
        points.append(TrendPoint(date=d, revenue=_money(rev), cost=_money(cst), profit=_money(rev - cst)))
    return SalesTrend(granularity=granularity, points=points)


async def get_by_branch(db: AsyncSession, period: ReportPeriod) -> list[BranchRevenue]:
    (start, end), _ = _windows(period, datetime.now(REPORT_TZ))
    rows = (
        await db.execute(
            select(
                Sale.branch_id,
                BranchModel.name,
                func.count(Sale.id),
                func.coalesce(func.sum(Sale.total), 0),
            )
            .join(BranchModel, BranchModel.id == Sale.branch_id)
            .where(
                Sale.status == SaleStatus.COMPLETED,
                Sale.created_at >= _to_db(start),
                Sale.created_at <= _to_db(end),
            )
            .group_by(Sale.branch_id, BranchModel.name)
            .order_by(func.sum(Sale.total).desc())
        )
    ).all()
    return [
        BranchRevenue(branch_id=r[0], branch_name=r[1], sales_count=r[2], revenue=_money(r[3]))
        for r in rows
    ]