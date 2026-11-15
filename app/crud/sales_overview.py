"""
Sales overview for managers: filtered list + summary cards + one-sale detail.
Read-only. Periods are measured in the business timezone (not UTC).
"""
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.reports import REPORT_TZ, _to_db
from app.crud.sales import get_sale_or_404
from app.models.branches import BranchModel
from app.models.customers import Customer
from app.models.products import Product
from app.models.sales import Payment, PaymentStatus, Sale, SaleItem, SaleStatus
from app.models.users import UserModel
from app.schemas.sales import (
    MethodSummary, PaymentDetail, SaleDetail, SaleItemDetail, SalesOverview,
    SalesPeriod, SaleRow, SalesSummary,
)

ZERO = Decimal("0")
DAY = timedelta(days=1)


def _f(value) -> float:
    return float(Decimal(value or 0).quantize(Decimal("0.01")))


def _like(term: str) -> str:
    t = term.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{t}%"


def resolve_window(
    period: SalesPeriod, date_from: Optional[date], date_to: Optional[date]
) -> tuple[Optional[datetime], Optional[datetime]]:
    """(start, end) as aware local datetimes. `end` is EXCLUSIVE. None = unbounded.
    A custom date range wins over the preset."""
    today = datetime.combine(datetime.now(REPORT_TZ).date(), time.min, tzinfo=REPORT_TZ)

    if date_from or date_to:
        start = datetime.combine(date_from, time.min, tzinfo=REPORT_TZ) if date_from else None
        end = datetime.combine(date_to + DAY, time.min, tzinfo=REPORT_TZ) if date_to else None
        return start, end

    if period is SalesPeriod.today:
        return today, today + DAY
    if period is SalesPeriod.yesterday:
        return today - DAY, today
    if period is SalesPeriod.week:
        monday = today - timedelta(days=today.weekday())
        return monday, monday + 7 * DAY
    if period is SalesPeriod.month:
        first = today.replace(day=1)
        return first, (first + 32 * DAY).replace(day=1)
    if period is SalesPeriod.last_month:
        first = today.replace(day=1)
        return (first - DAY).replace(day=1), first
    if period is SalesPeriod.year:
        first = today.replace(month=1, day=1)
        return first, first.replace(year=first.year + 1)
    return None, None


def build_filters(
    *, start, end, branch_id, created_by, customer_id, payment_status, payment_method, search
) -> list:
    """Every filter EXCEPT the sale status (the summary always describes completed sales)."""
    f = []
    if branch_id:
        f.append(Sale.branch_id == branch_id)
    if created_by:
        f.append(Sale.created_by == created_by)
    if customer_id:
        f.append(Sale.customer_id == customer_id)
    if payment_status:
        f.append(Sale.payment_status == payment_status)
    if payment_method:
        # sales paid (even partly) with this method, plus whole-sale summaries like "credit"
        f.append(
            or_(
                Sale.payment_method == payment_method,
                Sale.id.in_(select(Payment.sale_id).where(Payment.method == payment_method)),
            )
        )
    if search and search.strip():
        f.append(Sale.sale_number.ilike(_like(search), escape="\\"))
    if start:
        f.append(Sale.created_at >= _to_db(start))
    if end:
        f.append(Sale.created_at < _to_db(end))
    return f


async def _name_map(db: AsyncSession, model, ids, *attrs) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = (await db.execute(select(model).where(model.id.in_(ids)))).scalars().all()
    return {r.id: next((v for a in attrs if (v := getattr(r, a, None))), None) for r in rows}


async def _summary(db: AsyncSession, base: list) -> SalesSummary:
    completed = [*base, Sale.status == SaleStatus.COMPLETED]

    count, revenue, discount, paid, due = (
        await db.execute(
            select(
                func.count(Sale.id),
                func.coalesce(func.sum(Sale.total), 0),
                func.coalesce(func.sum(Sale.discount), 0),
                func.coalesce(func.sum(Sale.amount_paid), 0),
                func.coalesce(func.sum(Sale.balance_due), 0),
            ).where(*completed)
        )
    ).one()

    # separate query: joining items above would repeat Sale.total once per item
    cost = (
        await db.execute(
            select(func.coalesce(func.sum(SaleItem.unit_cost * SaleItem.quantity), 0))
            .select_from(SaleItem)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(*completed)
        )
    ).scalar_one()

    today = datetime.now(REPORT_TZ).date()
    overdue_count, overdue_amount = (
        await db.execute(
            select(func.count(Sale.id), func.coalesce(func.sum(Sale.balance_due), 0)).where(
                *completed, Sale.balance_due > 0, Sale.due_date < today
            )
        )
    ).one()

    voided_count, voided_total = (
        await db.execute(
            select(func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0)).where(
                *base, Sale.status == SaleStatus.VOIDED
            )
        )
    ).one()

    by_method = (
        await db.execute(
            select(Payment.method, func.coalesce(func.sum(Payment.amount), 0), func.count(Payment.id))
            .join(Sale, Sale.id == Payment.sale_id)
            .where(*completed)
            .group_by(Payment.method)
            .order_by(func.sum(Payment.amount).desc())
        )
    ).all()

    revenue_d, cost_d = Decimal(revenue), Decimal(cost)
    return SalesSummary(
        sales_count=count,
        revenue=_f(revenue_d),
        cost=_f(cost_d),
        profit=_f(revenue_d - cost_d),
        discount=_f(discount),
        paid=_f(paid),
        balance_due=_f(due),
        overdue_count=overdue_count,
        overdue_amount=_f(overdue_amount),
        voided_count=voided_count,
        voided_total=_f(voided_total),
        by_method=[MethodSummary(method=m, total=_f(t), count=c) for m, t, c in by_method],
    )


async def _rows(db: AsyncSession, filters: list, skip: int, limit: int):
    total = (await db.execute(select(func.count()).select_from(Sale).where(*filters))).scalar_one()
    sales = (
        await db.execute(
            select(Sale)
            .where(*filters)
            .order_by(Sale.created_at.desc(), Sale.id)   # id keeps pages stable
            .offset(skip)
            .limit(min(limit, 200))
        )
    ).scalars().all()

    ids = [s.id for s in sales]
    stats: dict = {}
    if ids:
        stat_rows = (
            await db.execute(
                select(
                    SaleItem.sale_id,
                    func.count(SaleItem.id),
                    func.coalesce(func.sum(SaleItem.quantity), 0),
                    func.coalesce(func.sum(SaleItem.unit_cost * SaleItem.quantity), 0),
                )
                .where(SaleItem.sale_id.in_(ids))
                .group_by(SaleItem.sale_id)
            )
        ).all()
        stats = {r[0]: (r[1], int(r[2]), Decimal(r[3])) for r in stat_rows}

    branches = await _name_map(db, BranchModel, {s.branch_id for s in sales}, "name")
    staff = await _name_map(db, UserModel, {s.created_by for s in sales}, "full_name")
    customers = await _name_map(db, Customer, {s.customer_id for s in sales}, "full_name", "name")

    rows = []
    for s in sales:
        n_items, units, cost = stats.get(s.id, (0, 0, ZERO))
        voided = s.status == SaleStatus.VOIDED
        rows.append(
            SaleRow(
                id=s.id,
                sale_number=s.sale_number,
                branch_id=s.branch_id,
                branch_name=branches.get(s.branch_id),
                customer_id=s.customer_id,
                customer_name=customers.get(s.customer_id),
                staff_id=s.created_by,
                staff_name=staff.get(s.created_by),
                status=s.status,
                payment_status=s.payment_status,
                payment_method=s.payment_method,
                total=_f(s.total),
                discount=_f(s.discount),
                amount_paid=_f(s.amount_paid),
                balance_due=_f(s.balance_due),
                due_date=s.due_date,
                items_count=n_items,
                units=units,
                cost=_f(cost),
                profit=0.0 if voided else _f(Decimal(s.total) - cost),
                created_at=s.created_at,
            )
        )
    return total, rows


async def get_overview(
    db: AsyncSession,
    *,
    period: SalesPeriod,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    branch_id: Optional[uuid.UUID] = None,
    created_by: Optional[uuid.UUID] = None,
    customer_id: Optional[uuid.UUID] = None,
    status: Optional[SaleStatus] = None,
    payment_status: Optional[PaymentStatus] = None,
    payment_method: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
) -> SalesOverview:
    start, end = resolve_window(period, date_from, date_to)
    base = build_filters(
        start=start, end=end, branch_id=branch_id, created_by=created_by,
        customer_id=customer_id, payment_status=payment_status,
        payment_method=payment_method, search=search,
    )
    list_filters = [*base, Sale.status == status] if status else base

    summary = await _summary(db, base)
    total, rows = await _rows(db, list_filters, skip, limit)

    codes = (await db.execute(select(Payment.method).distinct().order_by(Payment.method))).scalars().all()
    methods = list(codes) + (["credit"] if "credit" not in codes else [])

    return SalesOverview(
        items=rows, total=total, skip=skip, limit=limit, summary=summary, methods=methods,
        window_start=start.date() if start else None,
        window_end=(end - DAY).date() if end else None,
    )


async def get_detail(db: AsyncSession, sale_id: uuid.UUID) -> SaleDetail:
    sale = await get_sale_or_404(db, sale_id)

    products = {
        p.id: p
        for p in (
            await db.execute(select(Product).where(Product.id.in_({i.product_id for i in sale.items})))
        ).scalars().all()
    }
    user_ids = {sale.created_by, sale.voided_by, *(p.received_by for p in sale.payments)}
    users = await _name_map(db, UserModel, user_ids, "full_name")
    branch = await db.get(BranchModel, sale.branch_id)
    customer = await db.get(Customer, sale.customer_id) if sale.customer_id else None

    items, cost = [], ZERO
    for i in sale.items:
        p = products.get(i.product_id)
        line_cost = Decimal(i.unit_cost) * i.quantity
        cost += line_cost
        items.append(
            SaleItemDetail(
                id=i.id, product_id=i.product_id,
                product_name=p.name if p else None, sku=p.sku if p else None,
                image_url=p.image_url if p else None,
                quantity=i.quantity, unit_price=_f(i.unit_price), unit_cost=_f(i.unit_cost),
                line_total=_f(i.line_total), profit=_f(Decimal(i.line_total) - line_cost),
            )
        )

    payments = [
        PaymentDetail(
            id=p.id, method=p.method, amount=_f(p.amount), reference=p.reference, note=p.note,
            received_by_name=users.get(p.received_by), created_at=p.created_at,
        )
        for p in sorted(sale.payments, key=lambda x: x.created_at)
    ]

    voided = sale.status == SaleStatus.VOIDED
    return SaleDetail(
        id=sale.id, sale_number=sale.sale_number,
        branch_id=sale.branch_id, branch_name=branch.name if branch else None,
        customer_id=sale.customer_id,
        customer_name=(getattr(customer, "full_name", None) or getattr(customer, "name", None)) if customer else None,
        customer_phone=getattr(customer, "phone", None) if customer else None,
        staff_id=sale.created_by, staff_name=users.get(sale.created_by),
        status=sale.status, payment_status=sale.payment_status, payment_method=sale.payment_method,
        note=sale.note, subtotal=_f(sale.subtotal), discount=_f(sale.discount), total=_f(sale.total),
        amount_paid=_f(sale.amount_paid), balance_due=_f(sale.balance_due), due_date=sale.due_date,
        created_at=sale.created_at, voided_at=sale.voided_at, voided_by_name=users.get(sale.voided_by),
        cost=_f(cost), profit=0.0 if voided else _f(Decimal(sale.total) - cost),
        items=items, payments=payments,
    )