"""
User crud layer: all business rules for users live here.
Routers call these functions; these functions talk to the database.
Every state-changing function writes an activity-log row in the SAME transaction.
"""
import uuid
from typing import Optional, Sequence
from datetime import datetime, timezone
from app.models.auth_tokens import RefreshTokenModel

from sqlalchemy import select, or_, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.users import UserModel, UserStatus
from app.schemas.users import UserCreate, UserUpdate, UserRole
from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    BadRequestError,
    ForbiddenError,
    UnauthorizedError,
)
from app.crud.activity_logs import add_activity, diff, jsonable
from app.crud.session_utils import revoke_all_for_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _normalize_email(email: Optional[str]) -> Optional[str]:
    """'Ahmed@Example.COM ' -> 'ahmed@example.com'. None-safe."""
    return email.strip().lower() if email else None


async def _ensure_unique_contact(
    db: AsyncSession,
    email: Optional[str],
    phone: Optional[str],
    exclude_user_id: Optional[uuid.UUID] = None,
) -> None:
    """Raise ConflictError if the email or phone already belongs to another user."""
    conditions = []
    if email:
        conditions.append(UserModel.email == email)
    if phone:
        conditions.append(UserModel.phone == phone)
    if not conditions:
        return

    stmt = select(UserModel).where(or_(*conditions))
    if exclude_user_id:
        stmt = stmt.where(UserModel.id != exclude_user_id)

    for u in (await db.execute(stmt)).scalars().all():
        if email and u.email == email:
            raise ConflictError("Email already registered", code="email_taken")
        if phone and u.phone == phone:
            raise ConflictError("Phone already registered", code="phone_taken")


async def _ensure_single_branch_admin(
    db: AsyncSession,
    branch_id: uuid.UUID,
    exclude_user_id: Optional[uuid.UUID] = None,
) -> None:
    """Business rule: each branch may have only ONE branch admin."""
    stmt = select(UserModel.id).where(
        UserModel.role == UserRole.BRANCH_ADMIN,
        UserModel.branch_id == branch_id,
    )
    if exclude_user_id:
        stmt = stmt.where(UserModel.id != exclude_user_id)

    if (await db.execute(stmt.limit(1))).scalar_one_or_none():
        raise ConflictError(
            "Admin for this branch already exists", code="branch_admin_exists"
        )


# ---------------------------------------------------------------------------
# Read (no logging: reads must not write rows)
# ---------------------------------------------------------------------------
async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> Optional[UserModel]:
    result = await db.execute(select(UserModel).where(UserModel.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[UserModel]:
    result = await db.execute(
        select(UserModel).where(UserModel.email == _normalize_email(email))
    )
    return result.scalar_one_or_none()


async def list_users(
    db: AsyncSession,
    *,
    branch_id: Optional[uuid.UUID] = None,
    role: Optional[UserRole] = None,
    status: Optional[UserStatus] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[Sequence[UserModel], int]:
    filters = []
    if branch_id:
        filters.append(UserModel.branch_id == branch_id)
    if role:
        filters.append(UserModel.role == role)
    if status:
        filters.append(UserModel.status == status)
    if search:
        like = f"%{search.strip()}%"
        filters.append(
            or_(UserModel.full_name.ilike(like), UserModel.email.ilike(like))
        )

    total = (
        await db.execute(select(func.count()).select_from(UserModel).where(*filters))
    ).scalar_one()

    rows = (
        await db.execute(
            select(UserModel)
            .where(*filters)
            .order_by(UserModel.created_at.desc())
            .offset(skip)
            .limit(min(limit, 200))
        )
    ).scalars().all()

    return rows, total


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
async def create_user(
    db: AsyncSession,
    user_in: UserCreate,
    actor: Optional[UserModel] = None,     
    device: Optional[dict] = None,          
) -> UserModel:
    if user_in.role == UserRole.SUPER_ADMIN:
        raise ForbiddenError(
            "Cannot create a super admin", code="super_admin_not_allowed"
        )
    email = _normalize_email(user_in.email)

    await _ensure_unique_contact(db, email, user_in.phone)

    if user_in.role == UserRole.BRANCH_ADMIN:
        if not user_in.branch_id:
            raise BadRequestError("Branch id is required", code="bad_request")
        await _ensure_single_branch_admin(db, user_in.branch_id)

    new_user = UserModel(
        full_name=user_in.full_name,
        email=email,
        phone=user_in.phone,
        role=user_in.role,
        hashed_password=hash_password(user_in.password),
        branch_id=user_in.branch_id,
    )
    db.add(new_user)
    try:
        await db.flush()  # assigns new_user.id; raises IntegrityError on duplicates
        add_activity(
            db,
            action="user.created",
            actor=actor,
            branch_id=new_user.branch_id,
            entity_type="user",
            entity_id=new_user.id,
            description=f"Created user {new_user.email}",
            meta={"role": jsonable(new_user.role), "branch_id": jsonable(new_user.branch_id)},
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("User already exists", code="conflict")

    await db.refresh(new_user)
    return new_user


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------
async def update_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    user_in: UserUpdate,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> UserModel:
    db_user = await get_user_by_id(db, user_id)
    if not db_user:
        raise NotFoundError("User not found", code="user_not_found")

    update_data = user_in.model_dump(exclude_unset=True)

    if update_data.get("email"):
        update_data["email"] = _normalize_email(update_data["email"])

    new_email = update_data.get("email")
    if new_email == db_user.email:
        new_email = None
    new_phone = update_data.get("phone")
    if new_phone == db_user.phone:
        new_phone = None
    if new_email or new_phone:
        await _ensure_unique_contact(db, new_email, new_phone, exclude_user_id=user_id)

    if user_in.role == UserRole.SUPER_ADMIN and db_user.role != UserRole.SUPER_ADMIN:
        raise ForbiddenError(
            "Cannot assign super admin role", code="super_admin_not_allowed"
        )

    target_role = user_in.role if user_in.role is not None else db_user.role
    target_branch_id = (
        user_in.branch_id if user_in.branch_id is not None else db_user.branch_id
    )
    if target_role == UserRole.BRANCH_ADMIN:
        if not target_branch_id:
            raise BadRequestError("Branch id is required", code="bad_request")
        await _ensure_single_branch_admin(db, target_branch_id, exclude_user_id=user_id)

    password = update_data.pop("password", None)

    # Compute the diff BEFORE applying anything, while old values still exist.
    changes = diff(db_user, update_data)

    if password:
        db_user.hashed_password = hash_password(password)
        await revoke_all_for_user(db, db_user.id)  # new password => log out everywhere

    for key, value in update_data.items():
        setattr(db_user, key, value)

    if changes or password:
        add_activity(
            db,
            action="user.updated",
            actor=actor,
            branch_id=db_user.branch_id,
            entity_type="user",
            entity_id=db_user.id,
            description=f"Updated user {db_user.email}",
            changes=changes or None,
            meta={"password_changed": True} if password else None,  # never log the password
            device=device,
        )
        if "role" in changes:
            add_activity(
                db,
                action="user.role_changed",
                actor=actor,
                branch_id=db_user.branch_id,
                entity_type="user",
                entity_id=db_user.id,
                changes={"role": changes["role"]},
                device=device,
            )

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError(
            "Email, phone, or branch admin already in use", code="conflict"
        )

    await db.refresh(db_user)
    return db_user


# ---------------------------------------------------------------------------
# Authentication and passwords
# ---------------------------------------------------------------------------
async def authenticate_user(db: AsyncSession, email: str, password: str) -> UserModel:
    """Check login credentials. Logging of success/failure happens in auth.login."""
    user = await get_user_by_email(db, email)

    if not user or not verify_password(password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password", code="invalid_credentials")

    if user.status != UserStatus.ACTIVE:
        raise ForbiddenError("Account is not active", code="account_inactive")
    
    return user


async def change_password(
    db: AsyncSession,
    user_id: uuid.UUID,
    old_password: str,
    new_password: str,
    device: Optional[dict] = None,
) -> None:
    """A user changes their OWN password (must know the old one)."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise NotFoundError("User not found", code="user_not_found")

    if not verify_password(old_password, user.hashed_password):
        raise BadRequestError("Old password is incorrect", code="wrong_password")

    user.hashed_password = hash_password(new_password)
    await revoke_all_for_user(db, user.id)
    add_activity(
        db,
        action="user.password_changed",
        actor=user,
        entity_type="user",
        entity_id=user.id,
        description="User changed own password; all sessions revoked",
        device=device,
    )
    await db.commit()


async def reset_password(
    db: AsyncSession,
    user_id: uuid.UUID,
    new_password: str,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> None:
    """An admin sets a new password without knowing the old one."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise NotFoundError("User not found", code="user_not_found")

    user.hashed_password = hash_password(new_password)
    await revoke_all_for_user(db, user.id)
    add_activity(
        db,
        action="user.password_reset_by_admin",
        actor=actor,
        branch_id=user.branch_id,
        entity_type="user",
        entity_id=user.id,
        description=f"Admin reset password of {user.email}; all sessions revoked",
        device=device,
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Status (soft delete) and hard delete
# ---------------------------------------------------------------------------
async def set_user_status(
    db: AsyncSession,
    user_id: uuid.UUID,
    status: UserStatus,
    actor: UserModel,                       # replaces acting_user_id
    device: Optional[dict] = None,
) -> UserModel:
    """Activate, deactivate, or suspend a user (the normal way to "delete")."""
    user = await get_user_by_id(db, user_id)
    if not user:
        raise NotFoundError("User not found", code="user_not_found")

    if user.id == actor.id:
        raise BadRequestError(
            "You cannot change your own status", code="self_status_change"
        )

    if user.role == UserRole.SUPER_ADMIN:
        raise ForbiddenError(
            "Cannot change a super admin's status", code="super_admin_protected"
        )

    old_status = user.status
    if old_status == status:
        return user  # nothing changed, nothing to log

    user.status = status
    if status != UserStatus.ACTIVE:
        await revoke_all_for_user(db, user.id)  # kick the user out of every device

    add_activity(
        db,
        action="user.status_changed",
        actor=actor,
        branch_id=user.branch_id,
        entity_type="user",
        entity_id=user.id,
        description=f"Status of {user.email}: {jsonable(old_status)} -> {jsonable(status)}",
        changes={"status": {"old": jsonable(old_status), "new": jsonable(status)}},
        device=device,
    )
    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    actor: Optional[UserModel] = None,
    device: Optional[dict] = None,
) -> None:
    """
    PERMANENT delete. Use only for users created by mistake.
    For real employees prefer set_user_status(..., UserStatus.INACTIVE).
    """
    user = await get_user_by_id(db, user_id)
    if not user:
        raise NotFoundError("User not found", code="user_not_found")

    if user.role == UserRole.SUPER_ADMIN:
        raise ForbiddenError(
            "Cannot delete a super admin", code="super_admin_protected"
        )

    # Snapshot BEFORE deleting: the row will be gone afterwards.
    snapshot = {
        "email": user.email,
        "full_name": user.full_name,
        "role": jsonable(user.role),
    }
    branch_id = user.branch_id

    try:
        await db.delete(user)
        add_activity(
            db,
            action="user.deleted",
            actor=actor,
            branch_id=branch_id,
            entity_type="user",
            entity_id=user_id,
            description=f"Permanently deleted user {snapshot['email']}",
            meta=snapshot,
            device=device,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictError(
            "User has related records and cannot be deleted. Deactivate the user instead.",
            code="user_has_dependencies",
        )
    except SQLAlchemyError:
        await db.rollback()
        raise
    
    
# ---------------------------------------------------------------------------
# Sessions (admin view). One ACTIVE row per signed-in device: refresh rotation
# revokes the old row each time it creates the new one.
# ---------------------------------------------------------------------------
def _active_sessions(user_id: uuid.UUID):
    return (
        RefreshTokenModel.user_id == user_id,
        RefreshTokenModel.revoked.is_(False),
        RefreshTokenModel.expires_at > datetime.now(timezone.utc),
    )


async def get_session_summary(
    db: AsyncSession, user_id: uuid.UUID
) -> tuple[int, Optional[datetime]]:
    """(number of active devices, last time the user was seen)."""
    active = (
        await db.execute(
            select(func.count()).select_from(RefreshTokenModel).where(*_active_sessions(user_id))
        )
    ).scalar_one()
    last_seen = (
        await db.execute(
            select(func.max(RefreshTokenModel.last_used_at)).where(
                RefreshTokenModel.user_id == user_id
            )
        )
    ).scalar_one_or_none()
    return active, last_seen


async def list_user_sessions(db: AsyncSession, user_id: uuid.UUID) -> Sequence[RefreshTokenModel]:
    stmt = (
        select(RefreshTokenModel)
        .where(*_active_sessions(user_id))
        .order_by(RefreshTokenModel.last_used_at.desc().nulls_last())
    )
    return (await db.execute(stmt)).scalars().all()


async def revoke_user_session(
    db: AsyncSession,
    target: UserModel,
    session_id: uuid.UUID,
    actor: UserModel,
    device: Optional[dict] = None,
) -> None:
    """Sign ONE device of `target` out. The user_id check stops cross-user revokes."""
    stored = await db.get(RefreshTokenModel, session_id)
    if not stored or stored.user_id != target.id or stored.revoked:
        raise NotFoundError("Session not found", code="session_not_found")

    stored.revoked = True
    add_activity(
        db,
        action="user.session_revoked",
        actor=actor,
        branch_id=target.branch_id,
        entity_type="user",
        entity_id=target.id,
        description=f"Signed {target.email} out of one device",
        meta={"session_id": str(session_id), "device_name": stored.device_name},
        device=device,
    )
    await db.commit()


async def revoke_all_user_sessions(
    db: AsyncSession,
    target: UserModel,
    actor: UserModel,
    device: Optional[dict] = None,
) -> int:
    """Sign `target` out of EVERY device. Returns how many devices were active."""
    count, _ = await get_session_summary(db, target.id)
    await revoke_all_for_user(db, target.id)
    add_activity(
        db,
        action="user.sessions_revoked",
        actor=actor,
        branch_id=target.branch_id,
        entity_type="user",
        entity_id=target.id,
        description=f"Signed {target.email} out of all devices",
        meta={"devices": count},
        device=device,
    )
    await db.commit()
    return count