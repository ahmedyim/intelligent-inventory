"""
Stock movement crud layer.

apply_stock_movement is the ONLY place that changes Inventory.quantity.
It writes the ledger row (StockMovement) and the activity-log row and updates
the quantity together, in the caller's transaction.
"""
from decimal import Decimal
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError
from app.crud.activity_logs import add_activity
from app.models.inventory import Inventory
from app.models.stock_movement import MovementType, StockMovement
from app.models.users import UserModel


async def apply_stock_movement(
    db: AsyncSession,
    inventory: Inventory,
    *,
    delta: int,
    reason: str,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
    movement_type: Optional[MovementType] = None,
    note: Optional[str] = None,
    unit_cost: Optional[Decimal] = None,
    unit_price: Optional[Decimal] = None,
    commit: bool = True,
) -> StockMovement:
    """
    The ONLY place that changes Inventory.quantity.
    Writes a ledger row + activity row and updates the quantity together.

    delta > 0 adds stock, delta < 0 removes stock (never below 0).
    unit_cost / unit_price: cost and price of THIS movement (optional).
    commit=False lets a caller (e.g. create_product, receive_stock) include this
    in a bigger transaction; the caller must then commit or roll back.

    `inventory` must already be locked: get it via _locked_inventory()
    (SELECT ... FOR UPDATE) so two requests can't overwrite each other.
    """
    if delta == 0:
        raise BadRequestError("Quantity change cannot be zero", code="zero_movement")

    before = inventory.quantity
    after = before + delta
    if after < 0:
        raise ConflictError(
            f"Insufficient stock: have {before}, need {-delta}",
            code="insufficient_stock",
        )

    if movement_type is None:
        movement_type = MovementType.IN if delta > 0 else MovementType.OUT

    inventory.quantity = after

    movement = StockMovement(
        inventory_id=inventory.id,
        product_id=inventory.product_id,
        branch_id=inventory.branch_id,
        movement_type=movement_type,
        quantity_change=delta,
        quantity_before=before,
        quantity_after=after,
        unit_cost=unit_cost,
        unit_price=unit_price,
        reason=reason,
        note=note,
        created_by=actor.id if actor else None,
    )
    db.add(movement)
    await db.flush()

    add_activity(
        db,
        action=f"stock.{movement_type.value.lower()}",
        actor=actor,
        branch_id=inventory.branch_id,
        entity_type="inventory",
        entity_id=inventory.id,
        description=f"Stock {before} -> {after} ({reason})",
        changes={"quantity": {"old": before, "new": after}},
        meta={
            "product_id": str(inventory.product_id),
            "reason": reason,
            "unit_cost": str(unit_cost) if unit_cost is not None else None,
            "unit_price": str(unit_price) if unit_price is not None else None,
        },
        device=device,
    )

    if commit:
        await db.commit()
        await db.refresh(movement)
    return movement