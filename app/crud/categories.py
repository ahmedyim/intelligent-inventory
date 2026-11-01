"""
Category crud layer: business rules for categories.
Every state-changing function writes an activity-log row in the SAME transaction.
"""
from typing import Optional, Sequence
from sqlalchemy import select, or_, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.categories import Category
from app.schemas.category import CategoryCreate, CategoryUpdate
from app.models.users import UserModel
from app.core.exceptions import ConflictError, NotFoundError
from app.crud.activity_logs import add_activity, diff, jsonable


def _normalize_name(name: Optional[str]) -> Optional[str]:
    """'Electronics & Accessories ' -> 'electronics & accessories'."""
    return name.strip().lower() if name else None


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
async def get_category_by_id(db: AsyncSession, category_id: int) -> Optional[Category]:
    result = await db.execute(select(Category).where(Category.id == category_id))
    return result.scalar_one_or_none()


async def list_categories(
    db: AsyncSession,
    *,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[Sequence[Category], int]:
    filters = []
    if is_active is not None:
        filters.append(Category.is_active == is_active)
    if search:
        like = f"%{search.strip()}%"
        filters.append(or_(Category.name.ilike(like), Category.description.ilike(like)))

    total = (
        await db.execute(select(func.count()).select_from(Category).where(*filters))
    ).scalar_one()

    rows = (
        await db.execute(
            select(Category)
            .where(*filters)
            .order_by(Category.name.asc())
            .offset(skip)
            .limit(min(limit, 200))
        )
    ).scalars().all()

    return rows, total


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
async def create_category(
    db: AsyncSession,
    category_in: CategoryCreate,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> Category:
    name_normalized = category_in.name.strip()

    # Check unique name
    existing = await db.execute(select(Category).where(func.lower(Category.name) == name_normalized.lower()))
    if existing.scalar_one_or_none():
        raise ConflictError("Category with this name already exists", code="category_name_taken")

    new_category = Category(
        name=name_normalized,
        description=category_in.description,
        is_active=category_in.is_active,
    )
    db.add(new_category)

    try:
        await db.flush()
        add_activity(
            db,
            action="category.created",
            actor=actor,
            entity_type="category",
            entity_id=new_category.id,
            description=f"Created category {new_category.name}",
            meta={"name": new_category.name},
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Category already exists", code="conflict")

    await db.refresh(new_category)
    return new_category


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------
async def update_category(
    db: AsyncSession,
    category_id: int,
    category_in: CategoryUpdate,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> Category:
    db_category = await get_category_by_id(db, category_id)
    if not db_category:
        raise NotFoundError("Category not found", code="category_not_found")

    update_data = category_in.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"]:
        update_data["name"] = update_data["name"].strip()
        # Check uniqueness if name changed
        if update_data["name"].lower() != db_category.name.lower():
            existing = await db.execute(
                select(Category).where(
                    func.lower(Category.name) == update_data["name"].lower(),
                    Category.id != category_id,
                )
            )
            if existing.scalar_one_or_none():
                raise ConflictError("Category name already in use", code="category_name_taken")

    changes = diff(db_category, update_data)

    for key, value in update_data.items():
        setattr(db_category, key, value)

    if changes:
        add_activity(
            db,
            action="category.updated",
            actor=actor,
            entity_type="category",
            entity_id=db_category.id,
            description=f"Updated category {db_category.name}",
            changes=changes,
            device=device,
        )

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Category update conflict", code="conflict")

    await db.refresh(db_category)
    return db_category


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------
async def delete_category(
    db: AsyncSession,
    category_id: int,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> None:
    db_category = await get_category_by_id(db, category_id)
    if not db_category:
        raise NotFoundError("Category not found", code="category_not_found")

    snapshot = {"name": db_category.name}

    try:
        await db.delete(db_category)
        add_activity(
            db,
            action="category.deleted",
            actor=actor,
            entity_type="category",
            entity_id=category_id,
            description=f"Permanently deleted category {snapshot['name']}",
            meta=snapshot,
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError(
            "Category has assigned products and cannot be deleted. Deactivate it instead.",
            code="category_has_dependencies",
        )
    except SQLAlchemyError:
        await db.rollback()
        raise