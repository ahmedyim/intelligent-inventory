from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory
from app.models.products import Product
from app.services import demand_data as dd
from app.services.forecasting import forecast_demand
from app.services.reorder import decide_reorder


async def generate_suggestions(
    db: AsyncSession,
    branch_id: UUID,
    horizon: int = 21,
    history_days: int = 90,
    exclude_product_ids: set[UUID] = frozenset(),
) -> list[dict]:
    rows = (
        await db.execute(
            select(Inventory, Product)
            .join(Product, Product.id == Inventory.product_id)
            .where(Inventory.branch_id == branch_id, Product.is_active.is_(True))
        )
    ).all()

    # two queries total, not two per product
    sales = await dd.get_daily_sales_by_product(db, branch_id, history_days)
    stockouts = await dd.get_stockout_days_by_product(db, branch_id, history_days)

    results = []
    for inv, product in rows:
        if product.id in exclude_product_ids:      # already approved recently
            continue

        series = dd.build_series(
            sales.get(product.id, {}), stockouts.get(product.id, set()), history_days
        )
        fc = forecast_demand(series, start=date.today(), horizon=horizon)
        min_level = (
            inv.reorder_level if inv.reorder_level is not None else product.reorder_level
        )
        r = decide_reorder(inv.quantity, fc, product.lead_time_days, min_level)

        if r.urgency != "ok":
            results.append({
                "product_id": product.id,
                "branch_id": branch_id,
                "supplier_id": product.supplier_id,
                "current_stock": inv.quantity,
                "suggested_qty": r.suggested_qty,
                "urgency": r.urgency,
                "confidence": r.confidence,
                "reason": r.reason,
                "method": fc.method,
            })

    order = {"critical": 0, "soon": 1}
    return sorted(results, key=lambda x: order[x["urgency"]])


async def forecast_for_product(
    db: AsyncSession,
    product_id: UUID,
    branch_id: UUID,
    horizon: int = 14,
    history_days: int = 90,
):
    sales = await dd.get_daily_sales_by_product(db, branch_id, history_days, product_id)
    stockouts = await dd.get_stockout_days_by_product(db, branch_id, history_days, product_id)
    series = dd.build_series(
        sales.get(product_id, {}), stockouts.get(product_id, set()), history_days
    )
    return forecast_demand(series, start=date.today(), horizon=horizon)