"""
Report tables for the Reports page AND the Excel/CSV export.
One builder per report, used by both, so the screen and the file always agree.

List reports (sales, receivables, stock) page in the database.
Summary reports (by-staff, by-branch, by-product, payments) return all their rows.
"""
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.reports import REPORT_TZ, _to_db
from app.crud.sales_overview import DAY, _f, _name_map, build_filters, resolve_window
from app.models.branches import BranchModel
from app.models.customers import Customer
from app.models.inventory import Inventory
from app.models.products import Product
from app.models.sales import Payment, Sale, SaleItem, SaleStatus
from app.models.users import UserModel
from app.schemas.report_tables import ReportColumn, ReportKey, ReportTable
from app.schemas.sales import SalesPeriod

MAX_ROWS = 20_000
ZERO = Decimal("0")


@dataclass
class Filters:
    period: SalesPeriod = SalesPeriod.month
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    branch_id: Optional[uuid.UUID] = None
    staff_id: Optional[uuid.UUID] = None
    method: Optional[str] = None


TITLES = {
    ReportKey.sales: "Sales list",
    ReportKey.by_staff: "Sales by staff",
    ReportKey.by_branch: "Sales by branch",
    ReportKey.by_product: "Sales by product",
    ReportKey.payments: "Payments by method",
    ReportKey.receivables: "Receivables (unpaid credit)",
    ReportKey.stock: "Stock valuation",
}
USES_PERIOD = {
    ReportKey.sales: True, ReportKey.by_staff: True, ReportKey.by_branch: True,
    ReportKey.by_product: True, ReportKey.payments: True,
    ReportKey.receivables: False, ReportKey.stock: False,
}


def _cols(*specs) -> list[ReportColumn]:
    return [ReportColumn(key=s[0], label=s[1], type=s[2] if len(s) > 2 else "text") for s in specs]


COLUMNS = {
    ReportKey.sales: _cols(
        ("created_at", "Date", "datetime"), ("sale_number", "Sale no."), ("branch", "Branch"),
        ("staff", "Staff"), ("customer", "Customer"), ("payment_method", "Payment"),
        ("items", "Items", "int"), ("units", "Units", "int"), ("total", "Total", "money"),
        ("discount", "Discount", "money"), ("paid", "Paid", "money"),
        ("balance_due", "Balance due", "money"), ("cost", "Cost", "money"),
        ("profit", "Profit", "money"), ("due_date", "Due date", "date"), ("status", "Status"),
    ),
    ReportKey.by_staff: _cols(
        ("staff", "Staff"), ("role", "Role"), ("branch", "Branch"), ("sales", "Sales", "int"),
        ("revenue", "Revenue", "money"), ("discount", "Discount", "money"), ("cost", "Cost", "money"),
        ("profit", "Profit", "money"), ("margin", "Margin", "percent"),
        ("average_sale", "Average sale", "money"), ("voided", "Voided", "int"),
    ),
    ReportKey.by_branch: _cols(
        ("branch", "Branch"), ("sales", "Sales", "int"), ("revenue", "Revenue", "money"),
        ("discount", "Discount", "money"), ("cost", "Cost", "money"), ("profit", "Profit", "money"),
        ("margin", "Margin", "percent"), ("collected", "Collected", "money"),
        ("outstanding", "Outstanding", "money"), ("voided", "Voided", "int"),
    ),
    ReportKey.by_product: _cols(
        ("product", "Product"), ("sku", "SKU"), ("units_sold", "Units sold", "int"),
        ("sales", "Sales", "int"), ("sales_value", "Sales value", "money"), ("cost", "Cost", "money"),
        ("profit", "Profit", "money"), ("margin", "Margin", "percent"), ("in_stock", "In stock now", "int"),
    ),
    ReportKey.payments: _cols(
        ("method", "Method"), ("payments", "Payments", "int"), ("received", "Received", "money"),
        ("refunded", "Refunded", "money"), ("net", "Net", "money"),
    ),
    ReportKey.receivables: _cols(
        ("sale_number", "Sale no."), ("created_at", "Sold on", "datetime"), ("customer", "Customer"),
        ("phone", "Phone"), ("branch", "Branch"), ("staff", "Staff"), ("due_date", "Due date", "date"),
        ("days_overdue", "Days overdue", "int"), ("total", "Total", "money"), ("paid", "Paid", "money"),
        ("balance_due", "Balance due", "money"),
    ),
    ReportKey.stock: _cols(
        ("product", "Product"), ("sku", "SKU"), ("branch", "Branch"), ("unit", "Unit"),
        ("quantity", "Quantity", "int"), ("unit_cost", "Average cost", "money"),
        ("stock_value", "Stock value", "money"), ("selling_price", "Selling price", "money"),
        ("reorder_level", "Reorder at", "int"), ("status", "Status"),
    ),
}


# ----------------------------------------------------------------- helpers
def _pretty(code: Optional[str]) -> str:
    return (code or "-").replace("_", " ").replace("-", " ").title()


def _margin(profit, revenue) -> Optional[float]:
    return round(float(Decimal(profit) / Decimal(revenue)), 4) if revenue else None


def _sale_filters(f: Filters, start, end, *, use_method: bool = False) -> list:
    return build_filters(
        start=start, end=end, branch_id=f.branch_id, created_by=f.staff_id, customer_id=None,
        payment_status=None, payment_method=f.method if use_method else None, search=None,
    )


async def _customers(db: AsyncSession, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = (await db.execute(select(Customer).where(Customer.id.in_(ids)))).scalars().all()
    return {
        c.id: (getattr(c, "full_name", None) or getattr(c, "name", None), getattr(c, "phone", None))
        for c in rows
    }


def _sums(rows: list[dict], money=(), ints=()) -> dict:
    totals = {k: round(sum((r.get(k) or 0) for r in rows), 2) for k in money}
    totals.update({k: int(sum((r.get(k) or 0) for r in rows)) for k in ints})
    return totals


def _blank() -> dict:
    return {"count": 0, "revenue": ZERO, "discount": ZERO, "paid": ZERO, "due": ZERO, "cost": ZERO, "voided": 0}


async def _grouped(db: AsyncSession, filters: list, group_col) -> dict:
    """Completed-sale figures grouped by one column (staff or branch)."""
    done = [*filters, Sale.status == SaleStatus.COMPLETED]
    main = (
        await db.execute(
            select(
                group_col, func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0),
                func.coalesce(func.sum(Sale.discount), 0), func.coalesce(func.sum(Sale.amount_paid), 0),
                func.coalesce(func.sum(Sale.balance_due), 0),
            ).where(*done).group_by(group_col)
        )
    ).all()
    costs = (
        await db.execute(
            select(group_col, func.coalesce(func.sum(SaleItem.unit_cost * SaleItem.quantity), 0))
            .select_from(SaleItem).join(Sale, Sale.id == SaleItem.sale_id)
            .where(*done).group_by(group_col)
        )
    ).all()
    voided = (
        await db.execute(
            select(group_col, func.count(Sale.id))
            .where(*filters, Sale.status == SaleStatus.VOIDED).group_by(group_col)
        )
    ).all()

    stats: dict = {}
    for key, cnt, rev, disc, paid, due in main:
        stats[key] = {**_blank(), "count": cnt, "revenue": Decimal(rev), "discount": Decimal(disc),
                      "paid": Decimal(paid), "due": Decimal(due)}
    for key, cost in costs:
        stats.setdefault(key, _blank())["cost"] = Decimal(cost)
    for key, cnt in voided:
        stats.setdefault(key, _blank())["voided"] = cnt
    return stats


# ----------------------------------------------------------------- builders
async def _sales(db, f, start, end, skip, limit):
    filters = _sale_filters(f, start, end, use_method=True)
    cost_sq = (
        select(
            SaleItem.sale_id.label("sale_id"),
            func.count(SaleItem.id).label("items"),
            func.coalesce(func.sum(SaleItem.quantity), 0).label("units"),
            func.coalesce(func.sum(SaleItem.unit_cost * SaleItem.quantity), 0).label("cost"),
        ).group_by(SaleItem.sale_id).subquery()
    )

    total = (await db.execute(select(func.count()).select_from(Sale).where(*filters))).scalar_one()
    raw = (
        await db.execute(
            select(
                Sale, func.coalesce(cost_sq.c.cost, 0), func.coalesce(cost_sq.c.items, 0),
                func.coalesce(cost_sq.c.units, 0),
            )
            .outerjoin(cost_sq, cost_sq.c.sale_id == Sale.id)
            .where(*filters)
            .order_by(Sale.created_at.desc(), Sale.id)
            .offset(skip).limit(limit)
        )
    ).all()

    branches = await _name_map(db, BranchModel, {r[0].branch_id for r in raw}, "name")
    staff = await _name_map(db, UserModel, {r[0].created_by for r in raw}, "full_name")
    customers = await _customers(db, {r[0].customer_id for r in raw})

    rows = []
    for sale, cost, n_items, units in raw:
        voided = sale.status == SaleStatus.VOIDED
        cost_d = Decimal(cost)
        rows.append({
            "created_at": sale.created_at, "sale_number": sale.sale_number,
            "branch": branches.get(sale.branch_id), "staff": staff.get(sale.created_by),
            "customer": (customers.get(sale.customer_id) or ("Walk-in",))[0] if sale.customer_id else "Walk-in",
            "payment_method": _pretty(sale.payment_method), "items": int(n_items), "units": int(units),
            "total": _f(sale.total), "discount": _f(sale.discount), "paid": _f(sale.amount_paid),
            "balance_due": _f(sale.balance_due), "cost": _f(cost_d),
            "profit": None if voided else _f(Decimal(sale.total) - cost_d),
            "due_date": sale.due_date, "status": "Voided" if voided else "Completed",
        })

    # totals cover ALL matching rows (not just this page) and completed sales only
    done = [*filters, Sale.status == SaleStatus.COMPLETED]
    cnt, rev, disc, paid, due = (
        await db.execute(
            select(
                func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0),
                func.coalesce(func.sum(Sale.discount), 0), func.coalesce(func.sum(Sale.amount_paid), 0),
                func.coalesce(func.sum(Sale.balance_due), 0),
            ).where(*done)
        )
    ).one()
    cost_total = (
        await db.execute(
            select(func.coalesce(func.sum(SaleItem.unit_cost * SaleItem.quantity), 0))
            .select_from(SaleItem).join(Sale, Sale.id == SaleItem.sale_id).where(*done)
        )
    ).scalar_one()
    totals = {
        "sale_number": f"{cnt} completed", "total": _f(rev), "discount": _f(disc), "paid": _f(paid),
        "balance_due": _f(due), "cost": _f(cost_total), "profit": _f(Decimal(rev) - Decimal(cost_total)),
    }
    return rows, total, totals


async def _by_staff(db, f, start, end):
    stats = await _grouped(db, _sale_filters(f, start, end), Sale.created_by)
    ids = [k for k in stats if k]
    users = {}
    if ids:
        users = {u.id: u for u in (await db.execute(select(UserModel).where(UserModel.id.in_(ids)))).scalars()}
    branches = await _name_map(db, BranchModel, {u.branch_id for u in users.values()}, "name")

    rows = []
    for key, s in sorted(stats.items(), key=lambda kv: kv[1]["revenue"], reverse=True):
        u = users.get(key)
        profit = s["revenue"] - s["cost"]
        rows.append({
            "staff": u.full_name if u else "Unknown",
            "role": _pretty(str(getattr(u.role, "value", u.role))) if u else "-",
            "branch": branches.get(u.branch_id) if u else None,
            "sales": s["count"], "revenue": _f(s["revenue"]), "discount": _f(s["discount"]),
            "cost": _f(s["cost"]), "profit": _f(profit), "margin": _margin(profit, s["revenue"]),
            "average_sale": _f(s["revenue"] / s["count"]) if s["count"] else 0.0, "voided": s["voided"],
        })
    totals = _sums(rows, money=("revenue", "discount", "cost", "profit"), ints=("sales", "voided"))
    totals["margin"] = round(totals["profit"] / totals["revenue"], 4) if totals["revenue"] else None
    totals["average_sale"] = round(totals["revenue"] / totals["sales"], 2) if totals["sales"] else 0.0
    return rows, len(rows), totals


async def _by_branch(db, f, start, end):
    stats = await _grouped(db, _sale_filters(f, start, end), Sale.branch_id)
    branches = await _name_map(db, BranchModel, set(stats), "name")

    rows = []
    for key, s in sorted(stats.items(), key=lambda kv: kv[1]["revenue"], reverse=True):
        profit = s["revenue"] - s["cost"]
        rows.append({
            "branch": branches.get(key, "Unknown"), "sales": s["count"], "revenue": _f(s["revenue"]),
            "discount": _f(s["discount"]), "cost": _f(s["cost"]), "profit": _f(profit),
            "margin": _margin(profit, s["revenue"]), "collected": _f(s["paid"]),
            "outstanding": _f(s["due"]), "voided": s["voided"],
        })
    totals = _sums(rows, money=("revenue", "discount", "cost", "profit", "collected", "outstanding"),
                   ints=("sales", "voided"))
    totals["margin"] = round(totals["profit"] / totals["revenue"], 4) if totals["revenue"] else None
    return rows, len(rows), totals


async def _by_product(db, f, start, end):
    done = [*_sale_filters(f, start, end), Sale.status == SaleStatus.COMPLETED]
    value = func.coalesce(func.sum(SaleItem.line_total), 0)
    raw = (
        await db.execute(
            select(
                SaleItem.product_id, func.coalesce(func.sum(SaleItem.quantity), 0), value,
                func.coalesce(func.sum(SaleItem.unit_cost * SaleItem.quantity), 0),
                func.count(distinct(SaleItem.sale_id)),
            )
            .select_from(SaleItem).join(Sale, Sale.id == SaleItem.sale_id)
            .where(*done).group_by(SaleItem.product_id).order_by(value.desc()).limit(MAX_ROWS)
        )
    ).all()

    ids = [r[0] for r in raw]
    products, stock = {}, {}
    if ids:
        products = {p.id: p for p in (await db.execute(select(Product).where(Product.id.in_(ids)))).scalars()}
        stock_stmt = (
            select(Inventory.product_id, func.coalesce(func.sum(Inventory.quantity), 0))
            .where(Inventory.product_id.in_(ids)).group_by(Inventory.product_id)
        )
        if f.branch_id:
            stock_stmt = stock_stmt.where(Inventory.branch_id == f.branch_id)
        stock = {pid: int(q) for pid, q in (await db.execute(stock_stmt)).all()}

    rows = []
    for pid, units, val, cost, n_sales in raw:
        p = products.get(pid)
        profit = Decimal(val) - Decimal(cost)
        rows.append({
            "product": p.name if p else "Removed product", "sku": p.sku if p else None,
            "units_sold": int(units), "sales": n_sales, "sales_value": _f(val), "cost": _f(cost),
            "profit": _f(profit), "margin": _margin(profit, val), "in_stock": stock.get(pid, 0),
        })
    totals = _sums(rows, money=("sales_value", "cost", "profit"), ints=("units_sold",))
    totals["margin"] = round(totals["profit"] / totals["sales_value"], 4) if totals["sales_value"] else None
    return rows, len(rows), totals


async def _payments(db, f, start, end):
    pf = []
    if start:
        pf.append(Payment.created_at >= _to_db(start))
    if end:
        pf.append(Payment.created_at < _to_db(end))
    if f.branch_id:
        pf.append(Sale.branch_id == f.branch_id)
    if f.staff_id:
        pf.append(Payment.received_by == f.staff_id)
    if f.method:
        pf.append(Payment.method == f.method)

    raw = (
        await db.execute(
            select(
                Payment.method, func.count(Payment.id),
                func.coalesce(func.sum(case((Payment.amount > 0, Payment.amount), else_=0)), 0),
                func.coalesce(func.sum(case((Payment.amount < 0, -Payment.amount), else_=0)), 0),
            )
            .join(Sale, Sale.id == Payment.sale_id).where(*pf).group_by(Payment.method)
        )
    ).all()

    rows = sorted(
        [{"method": _pretty(m), "payments": c, "received": _f(rec), "refunded": _f(ref),
          "net": _f(Decimal(rec) - Decimal(ref))} for m, c, rec, ref in raw],
        key=lambda r: r["net"], reverse=True,
    )
    return rows, len(rows), _sums(rows, money=("received", "refunded", "net"), ints=("payments",))


async def _receivables(db, f, skip, limit):
    filters = [Sale.status == SaleStatus.COMPLETED, Sale.balance_due > 0]
    if f.branch_id:
        filters.append(Sale.branch_id == f.branch_id)
    if f.staff_id:
        filters.append(Sale.created_by == f.staff_id)

    total, s_total, s_paid, s_due = (
        await db.execute(
            select(
                func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0),
                func.coalesce(func.sum(Sale.amount_paid), 0), func.coalesce(func.sum(Sale.balance_due), 0),
            ).where(*filters)
        )
    ).one()
    sales = (
        await db.execute(
            select(Sale).where(*filters)
            .order_by(Sale.due_date.asc().nulls_last(), Sale.created_at, Sale.id)
            .offset(skip).limit(limit)
        )
    ).scalars().all()

    branches = await _name_map(db, BranchModel, {s.branch_id for s in sales}, "name")
    staff = await _name_map(db, UserModel, {s.created_by for s in sales}, "full_name")
    customers = await _customers(db, {s.customer_id for s in sales})
    today = datetime.now(REPORT_TZ).date()

    rows = []
    for s in sales:
        name, phone = customers.get(s.customer_id, (None, None))
        rows.append({
            "sale_number": s.sale_number, "created_at": s.created_at, "customer": name, "phone": phone,
            "branch": branches.get(s.branch_id), "staff": staff.get(s.created_by), "due_date": s.due_date,
            "days_overdue": max(0, (today - s.due_date).days) if s.due_date else 0,
            "total": _f(s.total), "paid": _f(s.amount_paid), "balance_due": _f(s.balance_due),
        })
    totals = {"sale_number": f"{total} unpaid", "total": _f(s_total), "paid": _f(s_paid), "balance_due": _f(s_due)}
    return rows, total, totals


async def _stock(db, f, skip, limit):
    filters = [Product.is_active.is_(True)]
    if f.branch_id:
        filters.append(Inventory.branch_id == f.branch_id)
    join = Inventory.product_id == Product.id
    effective = func.coalesce(Inventory.reorder_level, Product.reorder_level)

    total = (
        await db.execute(select(func.count()).select_from(Inventory).join(Product, join).where(*filters))
    ).scalar_one()
    value = (
        await db.execute(
            select(func.coalesce(func.sum(Inventory.quantity * Product.cost_price), 0))
            .select_from(Inventory).join(Product, join).where(*filters, Inventory.quantity > 0)
        )
    ).scalar_one()
    raw = (
        await db.execute(
            select(Inventory, Product, effective).join(Product, join).where(*filters)
            .order_by(Product.name, Inventory.branch_id).offset(skip).limit(limit)
        )
    ).all()

    branches = await _name_map(db, BranchModel, {r[0].branch_id for r in raw}, "name")
    rows = []
    for inv, p, reorder in raw:
        qty = inv.quantity
        rows.append({
            "product": p.name, "sku": p.sku, "branch": branches.get(inv.branch_id), "unit": p.unit,
            "quantity": qty, "unit_cost": _f(p.cost_price),
            "stock_value": _f(Decimal(p.cost_price) * qty) if qty > 0 else 0.0,
            "selling_price": _f(p.selling_price), "reorder_level": int(reorder),
            "status": "Out of stock" if qty <= 0 else "Low" if qty <= reorder else "OK",
        })
    return rows, total, {"product": f"{total} stock lines", "stock_value": _f(value)}


# ----------------------------------------------------------------- entry point
def _range_text(start, end) -> str:
    if not start and not end:
        return "All time"
    a = f"{start:%d %b %Y}" if start else "the beginning"
    b = f"{end - DAY:%d %b %Y}" if end else "today"
    return a if start and end and (end - DAY).date() == start.date() else f"{a} - {b}"


async def _describe(db, f: Filters, uses_period: bool, start, end) -> list[str]:
    now = datetime.now(REPORT_TZ)
    lines = [f"Period: {_range_text(start, end)}" if uses_period else f"Position as of {now:%d %b %Y %H:%M}"]
    if f.branch_id:
        branch = await db.get(BranchModel, f.branch_id)
        lines.append(f"Branch: {branch.name if branch else 'Unknown'}")
    if f.staff_id:
        user = await db.get(UserModel, f.staff_id)
        lines.append(f"Staff: {user.full_name if user else 'Unknown'}")
    if f.method:
        lines.append(f"Payment method: {_pretty(f.method)}")
    return lines


async def build_report(
    db: AsyncSession, key: ReportKey, f: Filters, *, skip: int = 0, limit: Optional[int] = None
) -> ReportTable:
    """limit=None builds the FULL table for an export (capped at MAX_ROWS)."""
    uses_period = USES_PERIOD[key]
    start, end = resolve_window(f.period, f.date_from, f.date_to) if uses_period else (None, None)
    page_limit = min(limit, MAX_ROWS) if limit is not None else MAX_ROWS

    if key is ReportKey.sales:
        rows, total, totals = await _sales(db, f, start, end, skip, page_limit)
    elif key is ReportKey.receivables:
        rows, total, totals = await _receivables(db, f, skip, page_limit)
    elif key is ReportKey.stock:
        rows, total, totals = await _stock(db, f, skip, page_limit)
    else:
        builder = {
            ReportKey.by_staff: _by_staff, ReportKey.by_branch: _by_branch,
            ReportKey.by_product: _by_product, ReportKey.payments: _payments,
        }[key]
        rows, total, totals = await builder(db, f, start, end)
        skip, page_limit = 0, max(len(rows), 1)   # summary reports are one page

    codes = (await db.execute(select(Payment.method).distinct().order_by(Payment.method))).scalars().all()

    return ReportTable(
        key=key, title=TITLES[key], uses_period=uses_period, columns=COLUMNS[key], rows=rows,
        totals=totals, total=total, skip=skip, limit=page_limit,
        truncated=limit is None and total > len(rows),
        filters=await _describe(db, f, uses_period, start, end),
        methods=list(codes) + (["credit"] if "credit" not in codes else []),
        window_start=start.date() if start else None,
        window_end=(end - DAY).date() if end else None,
        generated_at=datetime.now(timezone.utc),
    )