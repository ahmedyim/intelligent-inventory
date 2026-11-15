"""
Payment method crud layer.
Methods are never deleted: disable them (is_active=False) so old payments
keep pointing to a real row.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.crud.activity_logs import add_activity, diff
from app.models.payment_methods import PaymentMethod
from app.schemas.payment_methods import PaymentMethodCreate, PaymentMethodUpdate


def _clean(value: str | None) -> str | None:
    value = value.strip() if value else None
    return value or None


async def get_method_or_404(db: AsyncSession, method_id: uuid.UUID) -> PaymentMethod:
    pm = await db.get(PaymentMethod, method_id)
    if not pm:
        raise NotFoundError("Payment method not found", code="payment_method_not_found")
    return pm


async def get_active_method_or_400(db: AsyncSession, method_id: uuid.UUID) -> PaymentMethod:
    """Used by sales: the method must exist and be active."""
    pm = await db.get(PaymentMethod, method_id)
    if not pm:
        raise BadRequestError("Payment method not found", code="payment_method_not_found")
    if not pm.is_active:
        raise BadRequestError(
            f"Payment method {pm.name} is disabled", code="payment_method_inactive"
        )
    return pm


async def list_methods(db: AsyncSession, *, only_active: bool = True) -> list[PaymentMethod]:
    stmt = select(PaymentMethod).order_by(PaymentMethod.sort_order, PaymentMethod.name)
    if only_active:
        stmt = stmt.where(PaymentMethod.is_active.is_(True))
    return list((await db.execute(stmt)).scalars().all())


async def create_method(
    db: AsyncSession, data: PaymentMethodCreate, *, actor, device
) -> PaymentMethod:
    payload = data.model_dump()
    payload["account_number"] = _clean(payload.get("account_number"))
    payload["account_name"] = _clean(payload.get("account_name"))

    pm = PaymentMethod(**payload)
    db.add(pm)
    try:
        await db.flush()
        add_activity(
            db,
            action="payment_method.created",
            actor=actor,
            entity_type="payment_method",
            entity_id=pm.id,
            description=f"Created payment method {pm.code} - {pm.name}",
            meta={"code": pm.code, "type": pm.type},
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Payment method code already exists", code="code_taken")
    except Exception:
        await db.rollback()
        raise
    await db.refresh(pm)
    return pm


async def update_method(
    db: AsyncSession, method_id: uuid.UUID, data: PaymentMethodUpdate, *, actor, device
) -> PaymentMethod:
    pm = await get_method_or_404(db, method_id)

    update_data = data.model_dump(exclude_unset=True)
    for key in ("account_number", "account_name"):
        if key in update_data:
            update_data[key] = _clean(update_data[key])

    # compute the diff BEFORE applying, while old values still exist
    changes = diff(pm, update_data)
    for key, value in update_data.items():
        setattr(pm, key, value)

    if changes:
        add_activity(
            db,
            action="payment_method.updated",
            actor=actor,
            entity_type="payment_method",
            entity_id=pm.id,
            description=f"Updated payment method {pm.code}",
            changes=changes,
            device=device,
        )
        # account number changes decide where customers send money: log them separately
        if "account_number" in changes or "account_name" in changes:
            add_activity(
                db,
                action="payment_method.account_changed",
                actor=actor,
                entity_type="payment_method",
                entity_id=pm.id,
                description=f"Account details changed for {pm.code}",
                changes={
                    k: v for k, v in changes.items() if k in ("account_number", "account_name")
                },
                device=device,
            )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    await db.refresh(pm)
    return pm