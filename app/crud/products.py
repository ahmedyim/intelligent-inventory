"""
Product crud layer: all business rules for products live here.
Routers call these functions; these functions talk to the database.
Every state-changing function writes an activity-log row in the SAME transaction.
"""
import uuid
from typing import Optional, Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.crud.activity_logs import add_activity, diff, jsonable
from app.crud.inventory import apply_receive
from app.models.branches import BranchModel
from app.models.categories import Category
from app.models.inventory import Inventory
from app.models.products import Product
from app.models.supplier import Supplier
from app.models.users import UserModel
from app.schemas.inventory import StockReceive
from app.schemas.products import ProductCreate, ProductUpdate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _normalize_sku(sku: Optional[str]) -> Optional[str]:
    """' sku-001 ' -> 'SKU-001'. None-safe."""
    return sku.strip().upper() if sku else None


def _normalize_barcode(barcode: Optional[str]) -> Optional[str]:
    """'' or '   ' -> None, so empty strings never collide on the unique index."""
    barcode = barcode.strip() if barcode else None
    return barcode or None


async def _ensure_unique_codes(
    db: AsyncSession,
    sku: Optional[str],
    barcode: Optional[str],
    exclude_product_id: Optional[uuid.UUID] = None,
) -> None:
    """Raise ConflictError if the SKU or barcode already belongs to another product."""
    conditions = []
    if sku:
        conditions.append(Product.sku == sku)
    if barcode:
        conditions.append(Product.barcode == barcode)
    if not conditions:
        return

    stmt = select(Product).where(or_(*conditions))
    if exclude_product_id:
        stmt = stmt.where(Product.id != exclude_product_id)

    for p in (await db.execute(stmt)).scalars().all():
        if sku and p.sku == sku:
            raise ConflictError("SKU already exists", code="sku_taken")
        if barcode and p.barcode == barcode:
            raise ConflictError("Barcode already exists", code="barcode_taken")


async def _ensure_relations_exist(
    db: AsyncSession,
    category_id: Optional[uuid.UUID],
    supplier_id: Optional[uuid.UUID],
) -> None:
    """Business rule: category/supplier must exist; supplier must be active."""
    if category_id is not None and await db.get(Category, category_id) is None:
        raise BadRequestError("Category not found", code="category_not_found")

    if supplier_id is not None:
        supplier = await db.get(Supplier, supplier_id)
        if supplier is None:
            raise BadRequestError("Supplier not found", code="supplier_not_found")
        if not supplier.is_active:
            raise BadRequestError("Supplier is inactive", code="supplier_inactive")


# ---------------------------------------------------------------------------
# Read (no logging: reads must not write rows)
# ---------------------------------------------------------------------------
async def get_product_by_id(
    db: AsyncSession, product_id: uuid.UUID
) -> Optional[Product]:
    result = await db.execute(select(Product).where(Product.id == product_id))
    return result.scalar_one_or_none()


async def get_product_or_404(db: AsyncSession, product_id: uuid.UUID) -> Product:
    product = await get_product_by_id(db, product_id)
    if not product:
        raise NotFoundError("Product not found", code="product_not_found")
    return product


async def get_product_by_sku(db: AsyncSession, sku: str) -> Optional[Product]:
    result = await db.execute(
        select(Product).where(Product.sku == _normalize_sku(sku))
    )
    return result.scalar_one_or_none()


async def get_product_by_barcode(db: AsyncSession, barcode: str) -> Optional[Product]:
    result = await db.execute(
        select(Product).where(Product.barcode == _normalize_barcode(barcode))
    )
    return result.scalar_one_or_none()

def _like_pattern(term: str) -> str:
    """Escape % and _ so they are searched literally, not used as wildcards."""
    t = term.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{t}%"

async def list_products(
    db: AsyncSession,
    *,
    category_id: Optional[uuid.UUID] = None,
    supplier_id: Optional[uuid.UUID] = None,
    is_active: Optional[bool] = True,
    search: Optional[str] = None,
    low_stock: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> tuple[Sequence[tuple[Product, int]], int]:
    # one row per product with its total stock across all branches
    stock_sq = (
        select(
            Inventory.product_id,
            func.coalesce(func.sum(Inventory.quantity), 0).label("total_stock"),
        )
        .group_by(Inventory.product_id)
        .subquery()
    )
    stock_col = func.coalesce(stock_sq.c.total_stock, 0)

    filters = []
    if category_id is not None:
        filters.append(Product.category_id == category_id)
    if supplier_id is not None:
        filters.append(Product.supplier_id == supplier_id)
    if is_active is not None:
        filters.append(Product.is_active == is_active)
    if search and search.strip():
        like = _like_pattern(search)
        filters.append(
            or_(
                Product.name.ilike(like, escape="\\"),
                Product.sku.ilike(like, escape="\\"),
                Product.barcode.ilike(like, escape="\\"),
            )
        )
    if low_stock:
        filters.append(stock_col <= Product.reorder_level)

    total = (
        await db.execute(
            select(func.count())
            .select_from(Product)
            .outerjoin(stock_sq, stock_sq.c.product_id == Product.id)
            .where(*filters)
        )
    ).scalar_one()

    rows = (
        await db.execute(
            select(Product, stock_col.label("total_stock"))
            .outerjoin(stock_sq, stock_sq.c.product_id == Product.id)
            .where(*filters)
            .order_by(Product.created_at.desc(), Product.id)
            .offset(skip)
            .limit(min(limit, 200))
        )
    ).all()  # list of (Product, total_stock) tuples

    return rows, total
# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
async def create_product(
    db: AsyncSession,
    product_in: ProductCreate,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> Product:
    """
    Create a product in ONE request. If `initial_stock` is given, the inventory
    row and its stock movement are created in the SAME transaction:
    either everything is saved or nothing is.
    """
    data = product_in.model_dump()
    initial_stock = data.pop("initial_stock", None)  # not a Product column
    data["sku"] = _normalize_sku(data["sku"])
    data["barcode"] = _normalize_barcode(data.get("barcode"))

    await _ensure_unique_codes(db, data["sku"], data["barcode"])
    await _ensure_relations_exist(db, data.get("category_id"), data.get("supplier_id"))

    if initial_stock and await db.get(BranchModel, initial_stock["branch_id"]) is None:
        raise BadRequestError("Branch not found", code="branch_not_found")

    new_product = Product(**data)
    db.add(new_product)
    try:
        await db.flush()  # assigns new_product.id; raises IntegrityError on duplicates

        if initial_stock:
            # creates the inventory row, adds the IN movement, sets average cost.
            # Does NOT commit: the single commit happens below.
            await apply_receive(
                db,
                StockReceive(
                    product_id=new_product.id,
                    branch_id=initial_stock["branch_id"],
                    quantity=initial_stock["quantity"],
                    unit_cost=new_product.cost_price,
                    reason="initial_stock",
                ),
                actor.id if actor else None,
            )

        add_activity(
            db,
            action="product.created",
            actor=actor,
            entity_type="product",
            entity_id=new_product.id,
            description=f"Created product {new_product.sku} - {new_product.name}",
            meta={
                "sku": new_product.sku,
                "cost_price": jsonable(new_product.cost_price),
                "selling_price": jsonable(new_product.selling_price),
                "category_id": jsonable(new_product.category_id),
                "supplier_id": jsonable(new_product.supplier_id),
                "initial_stock": jsonable(initial_stock) if initial_stock else None,
            },
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Product already exists", code="conflict")
    except SQLAlchemyError:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise

    await db.refresh(new_product)
    return new_product


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------
async def update_product(
    db: AsyncSession,
    product_id: uuid.UUID,
    product_in: ProductUpdate,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> Product:
    product = await get_product_or_404(db, product_id)

    update_data = product_in.model_dump(exclude_unset=True)

    if "sku" in update_data:
        update_data["sku"] = _normalize_sku(update_data["sku"])
    if "barcode" in update_data:
        update_data["barcode"] = _normalize_barcode(update_data["barcode"])

    # Only validate values that actually change.
    new_sku = update_data.get("sku")
    if new_sku == product.sku:
        new_sku = None
    new_barcode = update_data.get("barcode")
    if new_barcode == product.barcode:
        new_barcode = None
    if new_sku or new_barcode:
        await _ensure_unique_codes(db, new_sku, new_barcode, exclude_product_id=product_id)

    new_category = update_data.get("category_id")
    if new_category == product.category_id:
        new_category = None
    new_supplier = update_data.get("supplier_id")
    if new_supplier == product.supplier_id:
        new_supplier = None
    if new_category is not None or new_supplier is not None:
        await _ensure_relations_exist(db, new_category, new_supplier)

    # Compute the diff BEFORE applying anything, while old values still exist.
    changes = diff(product, update_data)

    for key, value in update_data.items():
        setattr(product, key, value)

    if changes:
        add_activity(
            db,
            action="product.updated",
            actor=actor,
            entity_type="product",
            entity_id=product.id,
            description=f"Updated product {product.sku}",
            changes=changes,
            device=device,
        )
        # Price changes are sensitive: give them their own searchable log row.
        price_changes = {
            k: v for k, v in changes.items() if k in ("cost_price", "selling_price")
        }
        if price_changes:
            add_activity(
                db,
                action="product.price_changed",
                actor=actor,
                entity_type="product",
                entity_id=product.id,
                changes=price_changes,
                device=device,
            )

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("SKU or barcode already in use", code="conflict")

    await db.refresh(product)
    return product


# ---------------------------------------------------------------------------
# Active flag (soft delete) and hard delete
# ---------------------------------------------------------------------------
async def set_product_active(
    db: AsyncSession,
    product_id: uuid.UUID,
    is_active: bool,
    actor: UserModel,
    device: Optional[dict] = None,
) -> Product:
    """Activate or deactivate a product (the normal way to "delete")."""
    product = await get_product_or_404(db, product_id)

    if product.is_active == is_active:
        return product  # nothing changed, nothing to log

    product.is_active = is_active
    add_activity(
        db,
        action="product.activated" if is_active else "product.deactivated",
        actor=actor,
        entity_type="product",
        entity_id=product.id,
        description=f"Product {product.sku} {'activated' if is_active else 'deactivated'}",
        changes={"is_active": {"old": not is_active, "new": is_active}},
        device=device,
    )
    await db.commit()
    await db.refresh(product)
    return product


async def delete_product(
    db: AsyncSession,
    product_id: uuid.UUID,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> None:
    """
    PERMANENT delete. Use only for products created by mistake.
    For real products prefer set_product_active(..., False).
    """
    product = await get_product_or_404(db, product_id)

    # Business rule: never delete a product that still has stock somewhere.
    stock = (
        await db.execute(
            select(func.coalesce(func.sum(Inventory.quantity), 0)).where(
                Inventory.product_id == product_id
            )
        )
    ).scalar_one()
    if stock > 0:
        raise ConflictError(
            "Product still has stock. Deactivate it instead.", code="product_has_stock"
        )

    # Snapshot BEFORE deleting: the row will be gone afterwards.
    snapshot = {
        "sku": product.sku,
        "name": product.name,
        "barcode": product.barcode,
    }

    try:
        await db.delete(product)
        add_activity(
            db,
            action="product.deleted",
            actor=actor,
            entity_type="product",
            entity_id=product_id,
            description=f"Permanently deleted product {snapshot['sku']}",
            meta=snapshot,
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError(
            "Product has related records (e.g. stock movements) and cannot be deleted. "
            "Deactivate it instead.",
            code="product_has_dependencies",
        )
    except SQLAlchemyError:
        await db.rollback()
        raise