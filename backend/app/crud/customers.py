import uuid
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.crud.activity_logs import add_activity, diff
from app.models.customers import Customer
from app.models.sales import Sale, SaleStatus
from app.schemas.customers import CustomerCreate, CustomerUpdate


async def get_customer_or_404(db: AsyncSession, customer_id: uuid.UUID) -> Customer:
    c = await db.get(Customer, customer_id)
    if not c:
        raise NotFoundError("Customer not found", code="customer_not_found")
    return c


async def get_outstanding(db: AsyncSession, customer_id: uuid.UUID) -> Decimal:
    """What the customer owes: unpaid balance of all completed sales."""
    return (
        await db.execute(
            select(func.coalesce(func.sum(Sale.balance_due), 0)).where(
                Sale.customer_id == customer_id, Sale.status == SaleStatus.COMPLETED
            )
        )
    ).scalar_one()


async def create_customer(db: AsyncSession, data: CustomerCreate, *, actor, device) -> Customer:
    c = Customer(**data.model_dump())
    db.add(c)
    try:
        await db.flush()
        add_activity(
            db, action="customer.created", actor=actor, entity_type="customer",
            entity_id=c.id, description=f"Created customer {c.name}", device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Phone already used by another customer", code="phone_taken")
    await db.refresh(c)
    return c


async def update_customer(
    db: AsyncSession, customer_id: uuid.UUID, data: CustomerUpdate, *, actor, device
) -> Customer:
    c = await get_customer_or_404(db, customer_id)
    update_data = data.model_dump(exclude_unset=True)
    changes = diff(c, update_data)
    for k, v in update_data.items():
        setattr(c, k, v)
    if changes:
        add_activity(
            db, action="customer.updated", actor=actor, entity_type="customer",
            entity_id=c.id, description=f"Updated customer {c.name}",
            changes=changes, device=device,
        )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Phone already used by another customer", code="phone_taken")
    await db.refresh(c)
    return c


async def list_customers(
    db: AsyncSession, *, search: Optional[str], skip: int, limit: int
):
    filters = []
    if search:
        like = f"%{search.strip()}%"
        filters.append(or_(Customer.name.ilike(like), Customer.phone.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(Customer).where(*filters))).scalar_one()
    rows = (
        await db.execute(
            select(Customer).where(*filters).order_by(Customer.name).offset(skip).limit(min(limit, 200))
        )
    ).scalars().all()
    return rows, total