"""
Inventory crud layer: all stock business rules live here.
Every stock change updates Inventory.quantity AND appends a StockMovement
AND writes an activity-log row, all in the SAME transaction.

apply_* helpers never commit, so other crud functions (e.g. create_product)
can reuse them inside their own transaction.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.crud.activity_logs import add_activity, diff, jsonable
from app.models.inventory import Inventory
from app.models.products import Product
from app.models.stock_movement import MovementType, StockMovement
from app.schemas.inventory import (
    InventoryCreate,
    InventoryUpdate,
    StockAdjust,
    StockIssue,
    StockReceive,
)


# ======================= internal helpers =======================
async def _locked_product(db: AsyncSession, product_id: uuid.UUID) -> Product:
    product = (
        await db.execute(
            select(Product).where(Product.id == product_id).with_for_update()
        )
    ).scalar_one_or_none()
    if not product or not product.is_active:
        raise NotFoundError("Product not found", code="product_not_found")
    return product


async def _locked_inventory(
    db: AsyncSession, product_id: uuid.UUID, branch_id: uuid.UUID, *, create: bool
) -> Inventory:
    if create:
        # race-safe get-or-create, relies on uq_inventory_product_branch
        await db.execute(
            pg_insert(Inventory)
            .values(id=uuid.uuid4(), product_id=product_id, branch_id=branch_id, quantity=0)
            .on_conflict_do_nothing(constraint="uq_inventory_product_branch")
        )
    inv = (
        await db.execute(
            select(Inventory)
            .where(Inventory.product_id == product_id, Inventory.branch_id == branch_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not inv:
        raise NotFoundError(
            "No stock record for this product in this branch", code="inventory_not_found"
        )
    return inv


def _record_movement(
    db: AsyncSession,
    inv: Inventory,
    mtype: MovementType,
    change: int,
    reason: str,
    note: Optional[str],
    unit_cost: Optional[Decimal],
    unit_price: Optional[Decimal],
    user_id: Optional[uuid.UUID],
) -> None:
    before = inv.quantity
    after = before + change
    if after < 0:
        raise ConflictError(
            f"Insufficient stock: have {before}, need {-change}", code="insufficient_stock"
        )
    inv.quantity = after
    db.add(
        StockMovement(
            inventory_id=inv.id,
            product_id=inv.product_id,
            branch_id=inv.branch_id,
            movement_type=mtype,
            quantity_change=change,
            quantity_before=before,
            quantity_after=after,
            unit_cost=unit_cost,
            unit_price=unit_price,
            reason=reason,
            note=note,
            created_by=user_id,
        )
    )


# ======================= compatibility helper =======================
async def get_or_create_inventory(
    db: AsyncSession, product_id: uuid.UUID, branch_id: uuid.UUID
) -> Inventory:
    """Kept so older code that imports it still works."""
    return await _locked_inventory(db, product_id, branch_id, create=True)


# ======================= stock operations =======================
async def apply_receive(
    db: AsyncSession, data: StockReceive, user_id: Optional[uuid.UUID]
) -> Inventory:
    """Stock IN. NO commit. Used by /receive and by create_product (initial stock)."""
    product = await _locked_product(db, data.product_id)
    inv = await _locked_inventory(db, data.product_id, data.branch_id, create=True)

    # weighted-average cost across ALL branches
    total_qty = (
        await db.execute(
            select(func.coalesce(func.sum(Inventory.quantity), 0)).where(
                Inventory.product_id == data.product_id
            )
        )
    ).scalar_one()
    product.cost_price = (
        (product.cost_price * total_qty + data.unit_cost * data.quantity)
        / (total_qty + data.quantity)
    ).quantize(Decimal("0.01"))
    if data.new_selling_price is not None:
        product.selling_price = data.new_selling_price

    _record_movement(
        db, inv, MovementType.IN, data.quantity, data.reason, data.note,
        data.unit_cost, product.selling_price, user_id,
    )
    return inv


async def receive_stock(db: AsyncSession, data: StockReceive, *, actor, device) -> Inventory:
    try:
        inv = await apply_receive(db, data, actor.id)
        await db.flush()
        add_activity(
            db,
            action="stock.received",
            actor=actor,
            entity_type="inventory",
            entity_id=inv.id,
            description=f"Received {data.quantity} units",
            meta={
                "product_id": jsonable(data.product_id),
                "branch_id": jsonable(data.branch_id),
                "quantity": data.quantity,
                "unit_cost": jsonable(data.unit_cost),
                "new_selling_price": jsonable(data.new_selling_price),
                "reason": data.reason,
            },
            device=device,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    await db.refresh(inv)
    return inv


async def issue_stock(db: AsyncSession, data: StockIssue, *, actor, device) -> Inventory:
    try:
        product = await _locked_product(db, data.product_id)
        inv = await _locked_inventory(db, data.product_id, data.branch_id, create=False)
        _record_movement(
            db, inv, MovementType.OUT, -data.quantity, data.reason, data.note,
            product.cost_price, product.selling_price, actor.id,
        )
        add_activity(
            db,
            action="stock.issued",
            actor=actor,
            entity_type="inventory",
            entity_id=inv.id,
            description=f"Issued {data.quantity} units ({data.reason})",
            meta={
                "product_id": jsonable(data.product_id),
                "branch_id": jsonable(data.branch_id),
                "quantity": data.quantity,
                "reason": data.reason,
            },
            device=device,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    await db.refresh(inv)
    return inv


async def adjust_stock(db: AsyncSession, data: StockAdjust, *, actor, device) -> Inventory:
    try:
        product = await _locked_product(db, data.product_id)
        inv = await _locked_inventory(db, data.product_id, data.branch_id, create=True)

        old_qty = inv.quantity
        diff_qty = data.counted_quantity - old_qty
        inv.last_counted_at = datetime.now(timezone.utc)
        if diff_qty != 0:  # your CHECK forbids a zero-change movement
            _record_movement(
                db, inv, MovementType.ADJUSTMENT, diff_qty, "stock_count", data.note,
                product.cost_price, None, actor.id,
            )
        add_activity(
            db,
            action="stock.adjusted",
            actor=actor,
            entity_type="inventory",
            entity_id=inv.id,
            description=f"Stock count: {old_qty} -> {data.counted_quantity}",
            changes={"quantity": {"old": old_qty, "new": data.counted_quantity}},
            device=device,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    await db.refresh(inv)
    return inv


# ======================= inventory rows =======================
async def create_inventory(
    db: AsyncSession, data: InventoryCreate, *, actor, device
) -> Inventory:
    await _locked_product(db, data.product_id)
    exists = (
        await db.execute(
            select(Inventory.id).where(
                Inventory.product_id == data.product_id,
                Inventory.branch_id == data.branch_id,
            )
        )
    ).scalar_one_or_none()
    if exists:
        raise ConflictError(
            "Stock record already exists for this product in this branch",
            code="inventory_exists",
        )

    inv = Inventory(
        product_id=data.product_id,
        branch_id=data.branch_id,
        quantity=0,
        reorder_level=data.reorder_level,
    )
    db.add(inv)
    try:
        await db.flush()
        add_activity(
            db,
            action="inventory.created",
            actor=actor,
            entity_type="inventory",
            entity_id=inv.id,
            description="Created stock record",
            meta={
                "product_id": jsonable(data.product_id),
                "branch_id": jsonable(data.branch_id),
            },
            device=device,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    await db.refresh(inv)
    return inv


async def get_inventory_or_404(db: AsyncSession, inventory_id: uuid.UUID) -> Inventory:
    inv = (
        await db.execute(
            select(Inventory)
            .options(selectinload(Inventory.product))
            .where(Inventory.id == inventory_id)
        )
    ).scalar_one_or_none()
    if not inv:
        raise NotFoundError("Inventory record not found", code="inventory_not_found")
    return inv


async def update_inventory(
    db: AsyncSession, inventory_id: uuid.UUID, data: InventoryUpdate, *, actor, device
) -> Inventory:
    inv = await get_inventory_or_404(db, inventory_id)

    update_data = data.model_dump(exclude_unset=True)
    changes = diff(inv, update_data)  # BEFORE applying, while old values exist
    for field, value in update_data.items():
        setattr(inv, field, value)

    if changes:
        add_activity(
            db,
            action="inventory.updated",
            actor=actor,
            entity_type="inventory",
            entity_id=inv.id,
            description="Updated reorder level",
            changes=changes,
            device=device,
        )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return await get_inventory_or_404(db, inventory_id)


async def list_inventory(
    db: AsyncSession, *, branch_id, product_id, search, skip: int, limit: int
):
    stmt = select(Inventory).join(Product, Product.id == Inventory.product_id)
    if branch_id:
        stmt = stmt.where(Inventory.branch_id == branch_id)
    if product_id:
        stmt = stmt.where(Inventory.product_id == product_id)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            Product.name.ilike(like) | Product.sku.ilike(like) | Product.barcode.ilike(like)
        )
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await db.execute(
            stmt.options(selectinload(Inventory.product))
            .order_by(Product.name)
            .offset(skip)
            .limit(limit)
        )
    ).scalars().all()
    return rows, total


async def list_low_stock(db: AsyncSession, *, branch_id, skip: int, limit: int):
    effective_level = func.coalesce(Inventory.reorder_level, Product.reorder_level)
    stmt = (
        select(
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            Product.sku.label("sku"),
            Inventory.branch_id.label("branch_id"),
            Inventory.quantity.label("quantity"),
            effective_level.label("reorder_level"),
        )
        .select_from(Inventory)
        .join(Product, Product.id == Inventory.product_id)
        .where(Product.is_active.is_(True), Inventory.quantity <= effective_level)
    )
    if branch_id:
        stmt = stmt.where(Inventory.branch_id == branch_id)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await db.execute(stmt.order_by(Inventory.quantity).offset(skip).limit(limit))
    ).all()
    return rows, total


# ======================= movement history =======================
async def list_movements(
    db: AsyncSession, *, product_id, branch_id, reason, movement_type, skip: int, limit: int
):
    stmt = select(StockMovement)
    if product_id:
        stmt = stmt.where(StockMovement.product_id == product_id)
    if branch_id:
        stmt = stmt.where(StockMovement.branch_id == branch_id)
    if reason:
        stmt = stmt.where(StockMovement.reason == reason)
    if movement_type:
        stmt = stmt.where(StockMovement.movement_type == movement_type)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (
        await db.execute(
            stmt.order_by(StockMovement.created_at.desc()).offset(skip).limit(limit)
        )
    ).scalars().all()
    return rows, total