""" Supplier crud layer: all business rules for suppliers live here.
Routers call these functions; these functions talk to the database.
Every state-changing function writes an activity-log row in the SAME transaction.
"""
import uuid
from typing import Optional, Sequence

from sqlalchemy import select, or_, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.users import UserModel
from app.models.supplier import Supplier
from app.models.products import Product
from app.schemas.supplier import SupplierCreate, SupplierUpdate
from app.core.exceptions import ConflictError, NotFoundError, BadRequestError
from app.crud.activity_logs import add_activity, diff, jsonable


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _normalize_name(name: Optional[str]) -> Optional[str]:
    """'  Acme   Foods ' -> 'Acme Foods'. Collapses extra whitespace. None-safe."""
    return " ".join(name.split()) if name else None


def _normalize_email(email: Optional[str]) -> Optional[str]:
    return email.strip().lower() if email else None


def _clean(value: Optional[str]) -> Optional[str]:
    """Strip text; empty string becomes None."""
    if value is None:
        return None
    value = value.strip()
    return value or None


async def _ensure_unique_name(
    db: AsyncSession,
    name: str,
    exclude_supplier_id: Optional[uuid.UUID] = None,
) -> None:
    """Raise ConflictError if another supplier already has this name (case-insensitive)."""
    stmt = select(Supplier.id).where(func.lower(Supplier.name) == name.lower())
    if exclude_supplier_id:
        stmt = stmt.where(Supplier.id != exclude_supplier_id)

    if (await db.execute(stmt.limit(1))).scalar_one_or_none():
        raise ConflictError("Supplier name already exists", code="supplier_name_taken")


# ---------------------------------------------------------------------------
# Read (no logging: reads must not write rows)
# ---------------------------------------------------------------------------
async def get_supplier_by_id(
    db: AsyncSession, supplier_id: uuid.UUID
) -> Optional[Supplier]:
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    return result.scalar_one_or_none()


async def get_supplier_or_404(db: AsyncSession, supplier_id: uuid.UUID) -> Supplier:
    supplier = await get_supplier_by_id(db, supplier_id)
    if not supplier:
        raise NotFoundError("Supplier not found", code="supplier_not_found")
    return supplier


async def list_suppliers(
    db: AsyncSession,
    *,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[Sequence[Supplier], int]:
    filters = []
    if is_active is not None:
        filters.append(Supplier.is_active == is_active)
    if search:
        like = f"%{search.strip()}%"
        filters.append(
            or_(
                Supplier.name.ilike(like),
                Supplier.contact_person.ilike(like),
                Supplier.email.ilike(like),
                Supplier.phone.ilike(like),
            )
        )

    total = (
        await db.execute(select(func.count()).select_from(Supplier).where(*filters))
    ).scalar_one()

    rows = (
        await db.execute(
            select(Supplier)
            .where(*filters)
            .order_by(Supplier.name.asc())
            .offset(skip)
            .limit(min(limit, 200))
        )
    ).scalars().all()

    return rows, total


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
async def create_supplier(
    db: AsyncSession,
    supplier_in: SupplierCreate,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> Supplier:
    name = _normalize_name(supplier_in.name)
    await _ensure_unique_name(db, name)

    new_supplier = Supplier(
        name=name,
        contact_person=_clean(supplier_in.contact_person),
        email=_normalize_email(supplier_in.email),
        phone=_clean(supplier_in.phone),
        address=_clean(supplier_in.address),
    )
    db.add(new_supplier)
    try:
        await db.flush()  # assigns id; raises IntegrityError on duplicates
        add_activity(
            db,
            action="supplier.created",
            actor=actor,
            entity_type="supplier",
            entity_id=new_supplier.id,
            description=f"Created supplier {new_supplier.name}",
            meta={"name": new_supplier.name},
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Supplier already exists", code="conflict")

    await db.refresh(new_supplier)
    return new_supplier


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------
async def update_supplier(
    db: AsyncSession,
    supplier_id: uuid.UUID,
    supplier_in: SupplierUpdate,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> Supplier:
    supplier = await get_supplier_or_404(db, supplier_id)

    update_data = supplier_in.model_dump(exclude_unset=True)

    # name is NOT nullable in the model, so an explicit null is a client error
    if "name" in update_data:
        if not update_data["name"]:
            raise BadRequestError("Name cannot be empty", code="bad_request")
        update_data["name"] = _normalize_name(update_data["name"])
        if update_data["name"] != supplier.name:
            await _ensure_unique_name(
                db, update_data["name"], exclude_supplier_id=supplier_id
            )

    if "email" in update_data:
        update_data["email"] = _normalize_email(update_data["email"])
    for field in ("contact_person", "phone", "address"):
        if field in update_data:
            update_data[field] = _clean(update_data[field])

    # Compute the diff BEFORE applying anything, while old values still exist.
    changes = diff(supplier, update_data)

    for key, value in update_data.items():
        setattr(supplier, key, value)

    if changes:
        add_activity(
            db,
            action="supplier.updated",
            actor=actor,
            entity_type="supplier",
            entity_id=supplier.id,
            description=f"Updated supplier {supplier.name}",
            changes=changes,
            device=device,
        )

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Supplier name already in use", code="conflict")

    await db.refresh(supplier)
    return supplier


# ---------------------------------------------------------------------------
# Status (soft delete) and hard delete
# ---------------------------------------------------------------------------
async def set_supplier_status(
    db: AsyncSession,
    supplier_id: uuid.UUID,
    is_active: bool,
    actor: UserModel,
    device: Optional[dict] = None,
) -> Supplier:
    """Activate or deactivate a supplier (the normal way to "delete")."""
    supplier = await get_supplier_or_404(db, supplier_id)

    old_status = supplier.is_active
    if old_status == is_active:
        return supplier  # nothing changed, nothing to log

    supplier.is_active = is_active
    add_activity(
        db,
        action="supplier.status_changed",
        actor=actor,
        entity_type="supplier",
        entity_id=supplier.id,
        description=(
            f"Status of {supplier.name}: "
            f"{'active' if old_status else 'inactive'} -> "
            f"{'active' if is_active else 'inactive'}"
        ),
        changes={"is_active": {"old": old_status, "new": is_active}},
        device=device,
    )
    await db.commit()
    await db.refresh(supplier)
    return supplier


async def delete_supplier(
    db: AsyncSession,
    supplier_id: uuid.UUID,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> None:
    """
    PERMANENT delete. Use only for suppliers created by mistake.
    For real suppliers prefer set_supplier_status(..., False).
    """
    supplier = await get_supplier_or_404(db, supplier_id)

    # Explicit check: avoids SQLAlchemy lazy-loading `supplier.products`
    # during delete (which fails in async sessions) and gives a clear error.
    has_products = (
        await db.execute(
            select(Product.id).where(Product.supplier_id == supplier_id).limit(1)
        )
    ).scalar_one_or_none()
    if has_products:
        raise ConflictError(
            "Supplier has products and cannot be deleted. Deactivate the supplier instead.",
            code="supplier_has_dependencies",
        )

    # Snapshot BEFORE deleting: the row will be gone afterwards.
    snapshot = {
        "name": supplier.name,
        "email": supplier.email,
        "phone": supplier.phone,
    }

    try:
        await db.delete(supplier)
        add_activity(
            db,
            action="supplier.deleted",
            actor=actor,
            entity_type="supplier",
            entity_id=supplier_id,
            description=f"Permanently deleted supplier {snapshot['name']}",
            meta=snapshot,
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError(
            "Supplier has related records and cannot be deleted. Deactivate the supplier instead.",
            code="supplier_has_dependencies",
        )
    except SQLAlchemyError:
        await db.rollback()
        raise