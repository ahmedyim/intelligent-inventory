"""
Seller-facing reads and the refund rule. Nothing in here returns cost or profit.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError
from app.crud.sales import get_sale_or_404, void_sale
from app.crud.sales_overview import DAY, _f, _like, _name_map, _summary, build_filters, resolve_window
from app.models.branches import BranchModel
from app.models.customers import Customer
from app.models.inventory import Inventory
from app.models.products import Product
from app.models.sales import Payment, PaymentStatus, Sale, SaleItem, SaleStatus
from app.models.users import UserModel
from app.schemas.sales import SalesPeriod
from app.schemas.seller import (
    MySaleRow, MySalesOverview, MySalesSummary, PosProduct, PosStockItem, PosStockList,
    ReceiptItem, ReceiptPayment, SaleReceipt,
)

# A seller can refund their OWN sale for this long. After that an admin must do it.
REFUND_WINDOW_HOURS = 24


def _role(user) -> str:
    return str(getattr(user.role, "value", user.role))


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def refund_state(actor, sale) -> tuple[bool, Optional[str], Optional[datetime]]:
    """(allowed, reason it is not allowed, deadline for sellers)."""
    if sale.status == SaleStatus.VOIDED:
        return False, "This sale was already refunded.", None
    if _role(actor) in ("SUPER_ADMIN", "BRANCH_ADMIN"):
        return True, None, None          # the route already checked the branch
    if sale.created_by != actor.id:
        return False, "You can only refund your own sales.", None
    deadline = _utc(sale.created_at) + timedelta(hours=REFUND_WINDOW_HOURS)
    if datetime.now(timezone.utc) > deadline:
        return (
            False,
            f"The {REFUND_WINDOW_HOURS}-hour refund window has passed. Ask a branch admin.",
            deadline,
        )
    return True, None, deadline


# ---------------------------------------------------------------- my sales
async def get_my_sales(
    db: AsyncSession,
    actor,
    *,
    period: SalesPeriod,
    date_from: Optional[date],
    date_to: Optional[date],
    status: Optional[SaleStatus],
    payment_status: Optional[PaymentStatus],
    payment_method: Optional[str],
    search: Optional[str],
    skip: int,
    limit: int,
) -> MySalesOverview:
    start, end = resolve_window(period, date_from, date_to)
    base = build_filters(
        start=start, end=end, branch_id=actor.branch_id, created_by=actor.id, customer_id=None,
        payment_status=payment_status, payment_method=payment_method, search=search,
    )
    list_filters = [*base, Sale.status == status] if status else base

    # the shared summary also computes cost; it is simply not copied into the response
    s = await _summary(db, base)
    summary = MySalesSummary(
        sales_count=s.sales_count, total=s.revenue, discount=s.discount, paid=s.paid,
        balance_due=s.balance_due, overdue_count=s.overdue_count, overdue_amount=s.overdue_amount,
        voided_count=s.voided_count, voided_total=s.voided_total, by_method=s.by_method,
    )

    total = (await db.execute(select(func.count()).select_from(Sale).where(*list_filters))).scalar_one()
    sales = (
        await db.execute(
            select(Sale).where(*list_filters)
            .order_by(Sale.created_at.desc(), Sale.id)
            .offset(skip).limit(min(limit, 200))
        )
    ).scalars().all()

    stats: dict = {}
    if sales:
        stat_rows = (
            await db.execute(
                select(
                    SaleItem.sale_id, func.count(SaleItem.id),
                    func.coalesce(func.sum(SaleItem.quantity), 0),
                )
                .where(SaleItem.sale_id.in_([x.id for x in sales]))
                .group_by(SaleItem.sale_id)
            )
        ).all()
        stats = {sid: (n, int(units)) for sid, n, units in stat_rows}
    customers = await _name_map(db, Customer, {x.customer_id for x in sales}, "full_name", "name")

    rows = [
        MySaleRow(
            id=x.id, sale_number=x.sale_number, customer_name=customers.get(x.customer_id),
            status=x.status, payment_status=x.payment_status, payment_method=x.payment_method,
            total=_f(x.total), discount=_f(x.discount), amount_paid=_f(x.amount_paid),
            balance_due=_f(x.balance_due), due_date=x.due_date,
            items_count=stats.get(x.id, (0, 0))[0], units=stats.get(x.id, (0, 0))[1],
            created_at=x.created_at, can_refund=refund_state(actor, x)[0],
        )
        for x in sales
    ]

    codes = (await db.execute(select(Payment.method).distinct().order_by(Payment.method))).scalars().all()
    methods = list(codes) + (["credit"] if "credit" not in codes else [])

    return MySalesOverview(
        items=rows, total=total, skip=skip, limit=limit, summary=summary, methods=methods,
        window_start=start.date() if start else None,
        window_end=(end - DAY).date() if end else None,
        refund_window_hours=REFUND_WINDOW_HOURS,
    )


# ---------------------------------------------------------------- one sale
async def build_receipt(db: AsyncSession, actor, sale) -> SaleReceipt:
    products = {
        p.id: p
        for p in (
            await db.execute(select(Product).where(Product.id.in_({i.product_id for i in sale.items})))
        ).scalars().all()
    }
    users = await _name_map(
        db, UserModel, {sale.created_by, sale.voided_by, *(p.received_by for p in sale.payments)}, "full_name"
    )
    branch = await db.get(BranchModel, sale.branch_id)
    customer = await db.get(Customer, sale.customer_id) if sale.customer_id else None
    can, why, deadline = refund_state(actor, sale)

    return SaleReceipt(
        id=sale.id, sale_number=sale.sale_number, branch_id=sale.branch_id,
        branch_name=branch.name if branch else None,
        customer_name=(getattr(customer, "full_name", None) or getattr(customer, "name", None)) if customer else None,
        customer_phone=getattr(customer, "phone", None) if customer else None,
        staff_id=sale.created_by, staff_name=users.get(sale.created_by),
        status=sale.status, payment_status=sale.payment_status, payment_method=sale.payment_method,
        note=sale.note, subtotal=_f(sale.subtotal), discount=_f(sale.discount), total=_f(sale.total),
        amount_paid=_f(sale.amount_paid), balance_due=_f(sale.balance_due), due_date=sale.due_date,
        created_at=sale.created_at, voided_at=sale.voided_at, voided_by_name=users.get(sale.voided_by),
        items=[
            ReceiptItem(
                id=i.id, product_id=i.product_id,
                product_name=products[i.product_id].name if i.product_id in products else None,
                sku=products[i.product_id].sku if i.product_id in products else None,
                image_url=products[i.product_id].image_url if i.product_id in products else None,
                quantity=i.quantity, unit_price=_f(i.unit_price), line_total=_f(i.line_total),
            )
            for i in sale.items
        ],
        payments=[
            ReceiptPayment(
                id=p.id, method=p.method, amount=_f(p.amount), reference=p.reference, note=p.note,
                received_by_name=users.get(p.received_by), created_at=p.created_at,
            )
            for p in sorted(sale.payments, key=lambda x: x.created_at)
        ],
        can_refund=can, refund_deadline=deadline, refund_blocked_reason=why,
    )


async def refund_sale(db: AsyncSession, actor, sale_id: uuid.UUID, reason: str, *, device) -> SaleReceipt:
    sale = await get_sale_or_404(db, sale_id)
    allowed, why, _ = refund_state(actor, sale)
    if not allowed:
        error = ConflictError if sale.status == SaleStatus.VOIDED else ForbiddenError
        raise error(why, code="refund_not_allowed")

    voided = await void_sale(db, sale_id, reason, actor=actor, device=device)  # stock back, money refunded
    return await build_receipt(db, actor, voided)


# ---------------------------------------------------------------- POS catalog
async def list_pos_stock(
    db: AsyncSession, *, branch_id: uuid.UUID, search: Optional[str], low_stock: bool, skip: int, limit: int
) -> PosStockList:
    effective = func.coalesce(Inventory.reorder_level, Product.reorder_level)
    join = Inventory.product_id == Product.id
    filters = [Inventory.branch_id == branch_id, Product.is_active.is_(True)]
    if search and search.strip():
        like = _like(search)
        filters.append(
            or_(
                Product.name.ilike(like, escape="\\"),
                Product.sku.ilike(like, escape="\\"),
                Product.barcode.ilike(like, escape="\\"),
            )
        )
    if low_stock:
        filters.append(Inventory.quantity <= effective)

    total = (await db.execute(select(func.count()).select_from(Inventory).join(Product, join).where(*filters))).scalar_one()
    raw = (
        await db.execute(
            select(Inventory, Product).join(Product, join).where(*filters)
            .order_by(Product.name, Inventory.id).offset(skip).limit(min(limit, 200))
        )
    ).all()

    items = [
        PosStockItem(
            id=inv.id, branch_id=inv.branch_id, quantity=inv.quantity, reorder_level=inv.reorder_level,
            product=PosProduct(
                id=p.id, sku=p.sku, barcode=p.barcode, name=p.name, unit=p.unit, image_url=p.image_url,
                selling_price=_f(p.selling_price), reorder_level=p.reorder_level, is_active=p.is_active,
            ),
        )
        for inv, p in raw
    ]
    return PosStockList(items=items, total=total, skip=skip, limit=limit)