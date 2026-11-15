"""
Branch crud layer: all business rules for branches live here.
Routers call these functions; these functions talk to the database.
Every state-changing function writes an activity-log row in the SAME transaction.
"""
import uuid
from typing import Optional, Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.crud.activity_logs import add_activity, diff
from app.models.branches import BranchModel
from app.models.inventory import Inventory
from app.models.users import UserModel
from app.schemas.branches import BranchCreate, BranchUpdate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _clean(value: Optional[str]) -> Optional[str]:
    """'  bethel ' -> 'bethel'; '' or '   ' -> None. None-safe."""
    value = value.strip() if value else None
    return value or None


def _normalize_email(email: Optional[str]) -> Optional[str]:
    email = _clean(email)
    return email.lower() if email else None


async def _ensure_unique_name(
    db: AsyncSession,
    name: str,
    exclude_branch_id: Optional[uuid.UUID] = None,
) -> None:
    """Business rule: branch names are unique, ignoring upper/lower case."""
    stmt = select(BranchModel.id).where(func.lower(BranchModel.name) == name.lower())
    if exclude_branch_id:
        stmt = stmt.where(BranchModel.id != exclude_branch_id)

    if (await db.execute(stmt.limit(1))).scalar_one_or_none():
        raise ConflictError("Branch name already exists", code="branch_name_taken")


# ---------------------------------------------------------------------------
# Read (no logging: reads must not write rows)
# ---------------------------------------------------------------------------
async def get_branch_by_id(db: AsyncSession, branch_id: uuid.UUID) -> Optional[BranchModel]:
    result = await db.execute(select(BranchModel).where(BranchModel.id == branch_id))
    return result.scalar_one_or_none()


async def get_branch_by_name(db: AsyncSession, name: str) -> Optional[BranchModel]:
    result = await db.execute(
        select(BranchModel).where(func.lower(BranchModel.name) == name.strip().lower())
    )
    return result.scalar_one_or_none()


async def list_branches(
    db: AsyncSession,
    *,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[Sequence[BranchModel], int]:
    filters = []
    if search:
        like = f"%{search.strip()}%"
        filters.append(
            or_(
                BranchModel.name.ilike(like),
                BranchModel.location.ilike(like),
                BranchModel.email.ilike(like),
            )
        )

    total = (
        await db.execute(select(func.count()).select_from(BranchModel).where(*filters))
    ).scalar_one()

    rows = (
        await db.execute(
            select(BranchModel)
            .where(*filters)
            .order_by(BranchModel.name)
            .offset(skip)
            .limit(min(limit, 200))
        )
    ).scalars().all()

    return rows, total


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
async def create_branch(
    db: AsyncSession,
    branch_in: BranchCreate,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> BranchModel:
    name = branch_in.name.strip()
    if not name:
        raise BadRequestError("Branch name cannot be empty", code="bad_request")

    await _ensure_unique_name(db, name)

    new_branch = BranchModel(
        name=name,
        location=_clean(branch_in.location),
        email=_normalize_email(branch_in.email),
        phone=_clean(branch_in.phone),
    )
    db.add(new_branch)
    try:
        await db.flush()  # assigns new_branch.id
        add_activity(
            db,
            action="branch.created",
            actor=actor,
            branch_id=new_branch.id,
            entity_type="branch",
            entity_id=new_branch.id,
            description=f"Created branch {new_branch.name}",
            meta={"name": new_branch.name, "location": new_branch.location},
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Branch already exists", code="conflict")

    await db.refresh(new_branch)
    return new_branch


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------
async def update_branch(
    db: AsyncSession,
    branch_id: uuid.UUID,
    branch_in: BranchUpdate,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> BranchModel:
    branch = await get_branch_by_id(db, branch_id)
    if not branch:
        raise NotFoundError("Branch not found", code="branch_not_found")

    update_data = branch_in.model_dump(exclude_unset=True)

    # name is NOT nullable: it may be omitted but never blank/null
    if "name" in update_data:
        name = _clean(update_data["name"])
        if not name:
            raise BadRequestError("Branch name cannot be empty", code="bad_request")
        update_data["name"] = name
    if "location" in update_data:
        update_data["location"] = _clean(update_data["location"])
    if "email" in update_data:
        update_data["email"] = _normalize_email(update_data["email"])
    if "phone" in update_data:
        update_data["phone"] = _clean(update_data["phone"])

    new_name = update_data.get("name")
    if new_name and new_name != branch.name:
        await _ensure_unique_name(db, new_name, exclude_branch_id=branch_id)

    # Compute the diff BEFORE applying anything, while old values still exist.
    changes = diff(branch, update_data)

    for key, value in update_data.items():
        setattr(branch, key, value)

    if changes:
        add_activity(
            db,
            action="branch.updated",
            actor=actor,
            branch_id=branch.id,
            entity_type="branch",
            entity_id=branch.id,
            description=f"Updated branch {branch.name}",
            changes=changes,
            device=device,
        )

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("Branch name already in use", code="conflict")

    await db.refresh(branch)
    return branch


# ---------------------------------------------------------------------------
# Delete (branches have no status column, so this is a permanent delete)
# ---------------------------------------------------------------------------
async def delete_branch(
    db: AsyncSession,
    branch_id: uuid.UUID,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> None:
    """
    PERMANENT delete. Only allowed for an empty branch (no users, no inventory).
    """
    branch = await get_branch_by_id(db, branch_id)
    if not branch:
        raise NotFoundError("Branch not found", code="branch_not_found")

    user_count = (
        await db.execute(
            select(func.count()).select_from(UserModel).where(UserModel.branch_id == branch_id)
        )
    ).scalar_one()
    if user_count:
        raise ConflictError(
            f"Branch still has {user_count} user(s). Move or remove them first.",
            code="branch_has_users",
        )

    inventory_count = (
        await db.execute(
            select(func.count()).select_from(Inventory).where(Inventory.branch_id == branch_id)
        )
    ).scalar_one()
    if inventory_count:
        raise ConflictError(
            "Branch still has inventory records and cannot be deleted.",
            code="branch_has_inventory",
        )

    # Snapshot BEFORE deleting: the row will be gone afterwards.
    snapshot = {
        "name": branch.name,
        "location": branch.location,
        "email": branch.email,
        "phone": branch.phone,
    }

    try:
        await db.delete(branch)
        add_activity(
            db,
            action="branch.deleted",
            actor=actor,
            branch_id=None,  # the branch row is gone; don't point a FK at it
            entity_type="branch",
            entity_id=branch_id,
            description=f"Permanently deleted branch {snapshot['name']}",
            meta=snapshot,
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError(
            "Branch has related records and cannot be deleted.",
            code="branch_has_dependencies",
        )
    except SQLAlchemyError:
        await db.rollback()
        raise