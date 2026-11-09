"""
Sales crud layer.
A sale = Sale + SaleItems + one OUT stock movement per product + Payment rows,
all in ONE transaction. Quantity changes go ONLY through apply_stock_movement.

Money rules:
  total       = subtotal - discount
  amount_paid = sum(payments)            (net of refunds)
  balance_due = total - amount_paid      (> 0 means credit)

Customer rules:
  balance_due == 0 -> customer_id is OPTIONAL (walk-in sale)
  balance_due  > 0 -> customer_id and due_date are REQUIRED, and the customer
                      must stay under credit_limit
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.crud.activity_logs import add_activity, jsonable
from app.crud.customers import get_outstanding
from app.crud.inventory import _locked_inventory, _locked_product
from app.crud.payment_methods import get_active_method_or_400
from app.crud.stock_movements import apply_stock_movement
from app.models.branches import BranchModel
from app.models.customers import Customer
from app.models.sales import Payment, PaymentStatus, Sale, SaleItem, SaleStatus
from app.models.stock_movement import MovementType
from app.schemas.sales import PaymentIn, SaleCreate

ZERO = Decimal("0")


def _new_sale_number() -> str:
    now = datetime.now(timezone.utc)
    return f"S-{now:%Y%m%d}-{uuid.uuid4().hex[:6].upper()}"


def _payment_status(total: Decimal, paid: Decimal) -> PaymentStatus:
    if paid >= total:
        return PaymentStatus.PAID
    return PaymentStatus.PARTIAL if paid > 0 else PaymentStatus.UNPAID


def _method_summary(methods: set[str], balance: Decimal) -> str:
    if balance > 0 and not methods:
        return "credit"
    if balance > 0 or len(methods) > 1:
        return "mixed"
    return next(iter(methods), "cash")


async def _build_payment(
    db: AsyncSession, sale_id: uuid.UUID, p: PaymentIn, actor
) -> Payment:
    """Validate the method (exists, active, reference if required) and build the row."""
    pm = await get_active_method_or_400(db, p.payment_method_id)
    ref = p.reference.strip() if p.reference else None
    if pm.requires_reference and not ref:
        raise BadRequestError(
            f"Transaction reference is required for {pm.name}", code="reference_required"
        )
    return Payment(
        sale_id=sale_id,
        payment_method_id=pm.id,
        method=pm.code,          # snapshot of the code at payment time
        amount=p.amount,
        reference=ref,
        note=p.note,
        received_by=actor.id if actor else None,
    )


async def get_sale_or_404(db: AsyncSession, sale_id: uuid.UUID) -> Sale:
    sale = (
        await db.execute(
            select(Sale)
            .options(selectinload(Sale.items), selectinload(Sale.payments))
            .where(Sale.id == sale_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not sale:
        raise NotFoundError("Sale not found", code="sale_not_found")
    return sale


# ---------------------------------------------------------------- create
async def create_sale(db: AsyncSession, data: SaleCreate, *, actor, device) -> Sale:
    if await db.get(BranchModel, data.branch_id) is None:
        raise BadRequestError("Branch not found", code="branch_not_found")

    # merge duplicate lines of the same product
    qty_by_product: dict[uuid.UUID, int] = {}
    for it in data.items:
        qty_by_product[it.product_id] = qty_by_product.get(it.product_id, 0) + it.quantity

    try:
        sale = Sale(
            sale_number=_new_sale_number(),
            branch_id=data.branch_id,
            customer_id=data.customer_id,
            note=data.note,
            discount=data.discount,
            created_by=actor.id if actor else None,
        )
        db.add(sale)
        await db.flush()

        subtotal = ZERO
        # fixed lock order (sorted) prevents deadlocks between concurrent sales
        for product_id in sorted(qty_by_product, key=str):
            qty = qty_by_product[product_id]
            product = await _locked_product(db, product_id)
            inv = await _locked_inventory(db, product_id, data.branch_id, create=False)

            unit_price = product.selling_price
            unit_cost = product.cost_price
            line_total = (unit_price * qty).quantize(Decimal("0.01"))

            # raises ConflictError("insufficient_stock") if not enough stock
            await apply_stock_movement(
                db, inv,
                delta=-qty, reason="sale", actor=actor, device=device,
                movement_type=MovementType.OUT,
                note=f"Sale {sale.sale_number}",
                unit_cost=unit_cost, unit_price=unit_price,
                commit=False,
            )
            db.add(SaleItem(
                sale_id=sale.id, product_id=product_id, quantity=qty,
                unit_price=unit_price, unit_cost=unit_cost, line_total=line_total,
            ))
            subtotal += line_total

        if data.discount > subtotal:
            raise BadRequestError("Discount is bigger than the subtotal", code="invalid_discount")

        total = subtotal - data.discount
        paid = sum((p.amount for p in data.payments), ZERO)
        if paid > total:
            raise BadRequestError(
                f"Payments ({paid}) are more than the total ({total}). "
                "Send only the amount applied to this sale (cash change is not a payment).",
                code="overpayment",
            )
        balance = total - paid

        # ---- customer rules
        if balance > 0:
            # credit or partial payment: customer AND due date are mandatory
            if not data.customer_id:
                raise BadRequestError(
                    "A customer is required when the sale is not fully paid",
                    code="customer_required",
                )
            if not data.due_date:
                raise BadRequestError(
                    "A due date is required for credit sales", code="due_date_required"
                )
            if data.due_date < datetime.now(timezone.utc).date():
                raise BadRequestError("Due date cannot be in the past", code="invalid_due_date")

            customer = (
                await db.execute(
                    select(Customer).where(Customer.id == data.customer_id).with_for_update()
                )
            ).scalar_one_or_none()
            if not customer or not customer.is_active:
                raise BadRequestError("Customer not found or inactive", code="customer_not_found")

            outstanding = await get_outstanding(db, customer.id)
            if outstanding + balance > customer.credit_limit:
                raise ConflictError(
                    f"Credit limit exceeded: limit {customer.credit_limit}, "
                    f"already owes {outstanding}, this sale adds {balance}",
                    code="credit_limit_exceeded",
                )
        elif data.customer_id and await db.get(Customer, data.customer_id) is None:
            # fully paid: customer is optional, but if sent it must exist
            raise BadRequestError("Customer not found", code="customer_not_found")

        # ---- payments
        built = [await _build_payment(db, sale.id, p, actor) for p in data.payments]
        for pay in built:
            db.add(pay)

        sale.subtotal = subtotal
        sale.total = total
        sale.amount_paid = paid
        sale.balance_due = balance
        sale.payment_status = _payment_status(total, paid)
        sale.payment_method = _method_summary({pay.method for pay in built}, balance)
        sale.due_date = data.due_date if balance > 0 else None

        add_activity(
            db,
            action="sale.created",
            actor=actor,
            branch_id=data.branch_id,
            entity_type="sale",
            entity_id=sale.id,
            description=f"Sale {sale.sale_number} total {total}, paid {paid}, due {balance}",
            meta={
                "items": len(qty_by_product),
                "subtotal": jsonable(subtotal),
                "discount": jsonable(data.discount),
                "total": jsonable(total),
                "paid": jsonable(paid),
                "balance_due": jsonable(balance),
                "due_date": jsonable(sale.due_date),
                "payments": [
                    {"method": pay.method, "amount": jsonable(pay.amount), "reference": pay.reference}
                    for pay in built
                ],
                "customer_id": jsonable(data.customer_id),
            },
            device=device,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return await get_sale_or_404(db, sale.id)


# ------------------------------------------------- pay a credit balance later
async def add_payment(
    db: AsyncSession, sale_id: uuid.UUID, data: PaymentIn, *, actor, device
) -> Sale:
    try:
        sale = (
            await db.execute(select(Sale).where(Sale.id == sale_id).with_for_update())
        ).scalar_one_or_none()
        if not sale:
            raise NotFoundError("Sale not found", code="sale_not_found")
        if sale.status != SaleStatus.COMPLETED:
            raise ConflictError("Cannot pay a voided sale", code="sale_voided")
        if sale.balance_due <= 0:
            raise ConflictError("Sale is already fully paid", code="sale_fully_paid")
        if data.amount > sale.balance_due:
            raise BadRequestError(
                f"Amount is more than the balance due ({sale.balance_due})", code="overpayment"
            )

        pay = await _build_payment(db, sale.id, data, actor)
        db.add(pay)
        sale.amount_paid += data.amount
        sale.balance_due -= data.amount
        sale.payment_status = _payment_status(sale.total, sale.amount_paid)

        add_activity(
            db,
            action="sale.payment_added",
            actor=actor,
            branch_id=sale.branch_id,
            entity_type="sale",
            entity_id=sale.id,
            description=f"Payment {data.amount} ({pay.method}) on {sale.sale_number}",
            meta={
                "method": pay.method,
                "amount": jsonable(data.amount),
                "reference": pay.reference,
                "balance_due": jsonable(sale.balance_due),
            },
            device=device,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return await get_sale_or_404(db, sale_id)


# ---------------------------------------------------------------- void
async def void_sale(
    db: AsyncSession, sale_id: uuid.UUID, reason: Optional[str], *, actor, device
) -> Sale:
    """Cancel a sale: stock goes back, money paid is refunded (negative payment rows)."""
    sale = await get_sale_or_404(db, sale_id)
    if sale.status == SaleStatus.VOIDED:
        raise ConflictError("Sale is already voided", code="sale_already_voided")

    try:
        for item in sorted(sale.items, key=lambda i: str(i.product_id)):
            inv = await _locked_inventory(db, item.product_id, sale.branch_id, create=True)
            # NOT apply_receive: a void must not change the product's average cost
            await apply_stock_movement(
                db, inv,
                delta=item.quantity, reason="sale_void", actor=actor, device=device,
                movement_type=MovementType.IN,
                note=f"Void {sale.sale_number}" + (f": {reason}" if reason else ""),
                unit_cost=item.unit_cost, unit_price=item.unit_price,
                commit=False,
            )

        # refund what was actually received, per method
        net_by_method: dict[tuple, Decimal] = {}
        for p in sale.payments:
            key = (p.payment_method_id, p.method)
            net_by_method[key] = net_by_method.get(key, ZERO) + p.amount
        for (method_id, code), net in net_by_method.items():
            if net > 0:
                db.add(Payment(
                    sale_id=sale.id, payment_method_id=method_id, method=code,
                    amount=-net, note=f"Refund: void {sale.sale_number}",
                    received_by=actor.id if actor else None,
                ))

        refunded = sum((n for n in net_by_method.values() if n > 0), ZERO)
        sale.status = SaleStatus.VOIDED
        sale.amount_paid = ZERO
        sale.balance_due = ZERO   # a voided sale is no longer a debt
        sale.voided_at = datetime.now(timezone.utc)
        sale.voided_by = actor.id if actor else None

        add_activity(
            db,
            action="sale.voided",
            actor=actor,
            branch_id=sale.branch_id,
            entity_type="sale",
            entity_id=sale.id,
            description=f"Voided sale {sale.sale_number}, refund {refunded}",
            changes={"status": {"old": "COMPLETED", "new": "VOIDED"}},
            meta={"reason": reason, "refunded": jsonable(refunded)},
            device=device,
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return await get_sale_or_404(db, sale_id)


# ---------------------------------------------------------------- reads
async def list_sales(
    db: AsyncSession, *, branch_id=None, customer_id=None, created_by=None, status=None,
    payment_status=None, date_from=None, date_to=None, skip: int = 0, limit: int = 50,
):
    filters = []
    if branch_id:
        filters.append(Sale.branch_id == branch_id)
    if created_by:
        filters.append(Sale.created_by == created_by)
    if customer_id:
        filters.append(Sale.customer_id == customer_id)
    if status:
        filters.append(Sale.status == status)
    if payment_status:
        filters.append(Sale.payment_status == payment_status)
    if date_from:
        filters.append(Sale.created_at >= date_from)
    if date_to:
        filters.append(Sale.created_at <= date_to)

    total = (await db.execute(select(func.count()).select_from(Sale).where(*filters))).scalar_one()
    rows = (
        await db.execute(
            select(Sale)
            .options(selectinload(Sale.items), selectinload(Sale.payments))
            .where(*filters)
            .order_by(Sale.created_at.desc())
            .offset(skip)
            .limit(min(limit, 200))
        )
    ).scalars().all()
    return rows, total


async def payments_by_method(db: AsyncSession, *, branch_id=None, date_from=None, date_to=None):
    """Money received per method (refunds are negative, so they are netted out).
    Use it to close the day: cash in the drawer vs Telebirr vs each bank."""
    stmt = (
        select(Payment.method, func.sum(Payment.amount), func.count())
        .join(Sale, Sale.id == Payment.sale_id)
        .group_by(Payment.method)
        .order_by(Payment.method)
    )
    if branch_id:
        stmt = stmt.where(Sale.branch_id == branch_id)
    if date_from:
        stmt = stmt.where(Payment.created_at >= date_from)
    if date_to:
        stmt = stmt.where(Payment.created_at <= date_to)
    return (await db.execute(stmt)).all()