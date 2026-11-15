"""
Data for the public website (no login). Only counts and safe facts:
never cost, exact stock, SKU, barcode, staff or money totals.
"""
import time
from typing import Awaitable, Callable, Optional, TypeVar

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.reports import _to_db
from app.crud.sales_overview import _f, _like, resolve_window
from app.models.branches import BranchModel
from app.models.categories import Category
from app.models.inventory import Inventory
from app.models.products import Product
from app.models.sales import Sale, SaleStatus
from app.schemas.public import (
    PublicBranch, PublicCategory, PublicProduct, PublicProductList, PublicStats,
)
from app.schemas.sales import SalesPeriod

# Set to False if you do not want even the number of sales on the website
SHOW_SALES_COUNT = True

T = TypeVar("T")
_CACHE: dict[str, tuple[float, object]] = {}


async def cached(key: str, ttl: int, factory: Callable[[], Awaitable[T]]) -> T:
    """A tiny per-process cache so a busy home page does not hammer the database."""
    now = time.monotonic()
    hit = _CACHE.get(key)
    if hit and hit[0] > now:
        return hit[1]  # type: ignore[return-value]
    value = await factory()
    _CACHE[key] = (now + ttl, value)
    return value


def _active_branch_filters() -> list:
    """Only active branches, when your branch table has an is_active column."""
    col = getattr(BranchModel, "is_active", None)
    return [col.is_(True)] if col is not None else []


def _stock_subquery():
    """Per product: units on hand, and in how many branches it is in stock."""
    stmt = select(
        Inventory.product_id.label("product_id"),
        func.coalesce(func.sum(case((Inventory.quantity > 0, Inventory.quantity), else_=0)), 0).label("units"),
        func.count(case((Inventory.quantity > 0, Inventory.branch_id))).label("branches"),
    )
    flt = _active_branch_filters()
    if flt:
        stmt = stmt.join(BranchModel, BranchModel.id == Inventory.branch_id).where(*flt)
    return stmt.group_by(Inventory.product_id).subquery()


# ---------------------------------------------------------------- stats
async def get_stats(db: AsyncSession) -> PublicStats:
    flt = _active_branch_filters()

    branches = (await db.execute(select(func.count()).select_from(BranchModel).where(*flt))).scalar_one()
    products = (
        await db.execute(select(func.count()).select_from(Product).where(Product.is_active.is_(True)))
    ).scalar_one()

    units_stmt = (
        select(func.coalesce(func.sum(Inventory.quantity), 0))
        .select_from(Inventory)
        .join(Product, Product.id == Inventory.product_id)
        .where(Product.is_active.is_(True), Inventory.quantity > 0)
    )
    if flt:
        units_stmt = units_stmt.join(BranchModel, BranchModel.id == Inventory.branch_id).where(*flt)
    units = (await db.execute(units_stmt)).scalar_one()

    sales = None
    if SHOW_SALES_COUNT:
        start, end = resolve_window(SalesPeriod.month, None, None)
        sales = (
            await db.execute(
                select(func.count(Sale.id)).where(
                    Sale.status == SaleStatus.COMPLETED,
                    Sale.created_at >= _to_db(start),
                    Sale.created_at < _to_db(end),
                )
            )
        ).scalar_one()

    return PublicStats(branches=branches, products=products, units_in_stock=int(units), sales_this_month=sales)


# ---------------------------------------------------------------- branches
async def list_branches(db: AsyncSession) -> list[PublicBranch]:
    rows = (
        await db.execute(select(BranchModel).where(*_active_branch_filters()).order_by(BranchModel.name))
    ).scalars().all()
    return [
        PublicBranch(
            id=b.id, name=b.name, location=getattr(b, "location", None),
            phone=getattr(b, "phone", None), email=getattr(b, "email", None),
        )
        for b in rows
    ]


# ---------------------------------------------------------------- categories
async def list_categories(db: AsyncSession) -> list[PublicCategory]:
    rows = (
        await db.execute(
            select(Category.name, func.count(Product.id))
            .join(Product, Product.category_id == Category.id)
            .where(Product.is_active.is_(True))
            .group_by(Category.id, Category.name)
            .order_by(func.count(Product.id).desc(), Category.name)
        )
    ).all()
    return [PublicCategory(name=name, products=count) for name, count in rows]


# ---------------------------------------------------------------- products
async def list_products(
    db: AsyncSession,
    *,
    search: Optional[str],
    category: Optional[str],
    in_stock_only: bool,
    skip: int,
    limit: int,
) -> PublicProductList:
    stock = _stock_subquery()
    units = func.coalesce(stock.c.units, 0)
    branches_with = func.coalesce(stock.c.branches, 0)

    filters = [Product.is_active.is_(True)]
    if search and search.strip():
        filters.append(Product.name.ilike(_like(search), escape="\\"))
    if category and category.strip():
        filters.append(func.lower(Category.name) == category.strip().lower())
    if in_stock_only:
        filters.append(units > 0)

    joins = lambda stmt: (  # noqa: E731
        stmt.outerjoin(stock, stock.c.product_id == Product.id)
        .outerjoin(Category, Category.id == Product.category_id)
        .where(*filters)
    )

    total = (await db.execute(joins(select(func.count()).select_from(Product)))).scalar_one()
    rows = (
        await db.execute(
            joins(
                select(
                    Product,
                    Category.name.label("category_name"),
                    units.label("units"),
                    branches_with.label("branches"),
                )
            )
            .order_by(case((units > 0, 0), else_=1), Product.name, Product.id)   # in stock first
            .offset(skip)
            .limit(limit)
        )
    ).all()

    items = [
        PublicProduct(
            id=p.id, name=p.name,
            description=((p.description or "").strip()[:240] or None),
            unit=p.unit, image_url=p.image_url, price=_f(p.selling_price), category=cat,
            in_stock=int(u or 0) > 0, branches_available=int(b or 0),
        )
        for p, cat, u, b in rows
    ]
    return PublicProductList(items=items, total=total, skip=skip, limit=limit)


# ---------------------------------------------------------------- cached entry points
async def cached_stats(db: AsyncSession) -> PublicStats:
    return await cached("public:stats", 60, lambda: get_stats(db))


async def cached_branches(db: AsyncSession) -> list[PublicBranch]:
    return await cached("public:branches", 300, lambda: list_branches(db))


async def cached_categories(db: AsyncSession) -> list[PublicCategory]:
    return await cached("public:categories", 300, lambda: list_categories(db))