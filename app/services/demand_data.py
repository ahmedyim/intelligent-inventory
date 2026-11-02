from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sales import Sale, SaleItem, SaleStatus
from app.models.stock_movement import StockMovement  # adjust to your file name


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


async def get_daily_sales_by_product(
    db: AsyncSession,
    branch_id: UUID,
    days: int = 90,
    product_id: UUID | None = None,
) -> dict[UUID, dict[date, int]]:
    day = func.date(Sale.created_at)
    stmt = (
        select(SaleItem.product_id, day, func.sum(SaleItem.quantity))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(
            Sale.branch_id == branch_id,
            Sale.status == SaleStatus.COMPLETED,   # ignore voided sales
            Sale.created_at >= _since(days),
        )
        .group_by(SaleItem.product_id, day)
    )
    if product_id is not None:
        stmt = stmt.where(SaleItem.product_id == product_id)

    result = await db.execute(stmt)
    out: dict[UUID, dict[date, int]] = defaultdict(dict)
    for pid, d, qty in result.all():
        out[pid][d] = int(qty)
    return out


async def get_stockout_days_by_product(
    db: AsyncSession,
    branch_id: UUID,
    days: int = 90,
    product_id: UUID | None = None,
) -> dict[UUID, set[date]]:
    stmt = (
        select(StockMovement.product_id, func.date(StockMovement.created_at))
        .distinct()
        .where(
            StockMovement.branch_id == branch_id,
            StockMovement.quantity_after == 0,
            StockMovement.created_at >= _since(days),
        )
    )
    if product_id is not None:
        stmt = stmt.where(StockMovement.product_id == product_id)

    result = await db.execute(stmt)
    out: dict[UUID, set[date]] = defaultdict(set)
    for pid, d in result.all():
        out[pid].add(d)
    return out


def build_series(sales: dict[date, int], stockout_days: set[date], days: int = 90):
    """Pure function. One entry per day; None = stockout day (demand unknown)."""
    today = date.today()
    series = []
    for i in range(days, 0, -1):
        d = today - timedelta(days=i)
        series.append((d, None if d in stockout_days else sales.get(d, 0)))
    return series