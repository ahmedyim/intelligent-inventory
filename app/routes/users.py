import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.device import device_dep
from app.core.dependencies import get_current_user, require_admin
from app.core.exceptions import ForbiddenError, NotFoundError,BadRequestError
from app.crud import users as users_crud
from app.models.users import UserStatus
from app.schemas.auth import ChangePasswordRequest, MessageResponse
from app.schemas.users import (
    UserCreate, UserUpdate, UserRole, UserResponse, UserListResponse,
    AdminResetPasswordRequest, StatusUpdate,
    UserDetailResponse, UserSessionOut, RevokeResult
)

router = APIRouter(prefix="", tags=["users"])


# Branch scoping: a branch admin only reaches users of their own branch.
# Same "not found" error either way, so ids of other branches do not leak.
async def scoped_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current=Depends(require_admin),
):
    
    user = await users_crud.get_user_by_id(db, user_id)
    if not user or (
        current.role == UserRole.BRANCH_ADMIN and user.branch_id != current.branch_id
    ):
        raise NotFoundError("User not found", code="user_not_found")
    return user
@router.get("", response_model=UserListResponse)
async def list_users_route(
    branch_id: Optional[uuid.UUID] = None,
    role: Optional[UserRole] = None,
    status: Optional[UserStatus] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current=Depends(require_admin),
):
    if current.role == UserRole.BRANCH_ADMIN:
        branch_id = current.branch_id   # locked to own branch, whatever they send

    items, total = await users_crud.list_users(
        db, branch_id=branch_id, role=role, status=status,
        search=search, skip=skip, limit=limit,
    )
    return {"items": items, "total": total}


@router.post("", response_model=UserResponse, status_code=201)
async def create_user_route(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current=Depends(require_admin),
    device: dict = Depends(device_dep),
):
    
    if current.role == UserRole.BRANCH_ADMIN:
        if body.branch_id != current.branch_id:
            raise ForbiddenError(
                "You can only create users in your own branch", code="branch_forbidden"
            )
        if body.role in (UserRole.BRANCH_ADMIN, UserRole.SUPER_ADMIN):
            raise ForbiddenError("You cannot create admin users", code="role_forbidden")
    return await users_crud.create_user(db, body, actor=current, device=device)


# /me routes must be declared BEFORE any /{user_id} route.
@router.get("/me", response_model=UserResponse)
async def get_me(current=Depends(get_current_user)):
    return current


@router.post("/me/change-password", response_model=MessageResponse)
async def change_my_password_route(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current=Depends(get_current_user),
    device: dict = Depends(device_dep),
):
    await users_crud.change_password(
        db, current.id, body.old_password, body.new_password, device=device
    )
    return MessageResponse(message="Password changed. Please log in again")


def _forbid_self(target, current) -> None:
    if target.id == current.id:
        raise BadRequestError(
            "Use 'Log out of all devices' for your own account", code="self_session_revoke"
        )


@router.get("/{user_id}/detail", response_model=UserDetailResponse)
async def get_user_detail_route(
    target=Depends(scoped_user),
    db: AsyncSession = Depends(get_db),
):
    detail = UserDetailResponse.model_validate(target)
    detail.active_sessions, detail.last_active_at = await users_crud.get_session_summary(db, target.id)
    return detail


@router.get("/{user_id}/sessions", response_model=list[UserSessionOut])
async def list_user_sessions_route(
    target=Depends(scoped_user),
    db: AsyncSession = Depends(get_db),
):
    return await users_crud.list_user_sessions(db, target.id)


@router.delete("/{user_id}/sessions/{session_id}", response_model=MessageResponse)
async def revoke_user_session_route(
    session_id: uuid.UUID,
    target=Depends(scoped_user),
    db: AsyncSession = Depends(get_db),
    current=Depends(require_admin),
    device: dict = Depends(device_dep),
):
    _forbid_self(target, current)
    await users_crud.revoke_user_session(db, target, session_id, actor=current, device=device)
    return MessageResponse(message="Session revoked")


@router.post("/{user_id}/sessions/revoke-all", response_model=RevokeResult)
async def revoke_all_user_sessions_route(
    target=Depends(scoped_user),
    db: AsyncSession = Depends(get_db),
    current=Depends(require_admin),
    device: dict = Depends(device_dep),
):
    _forbid_self(target, current)
    count = await users_crud.revoke_all_user_sessions(db, target, actor=current, device=device)
    return RevokeResult(message="Signed out of all devices", revoked=count)

@router.get("/{user_id}", response_model=UserResponse)
async def get_user_route(target=Depends(scoped_user)):
    return target


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user_route(
    body: UserUpdate,
    target=Depends(scoped_user),
    db: AsyncSession = Depends(get_db),
    current=Depends(require_admin),
    device: dict = Depends(device_dep),
):
    if current.role == UserRole.BRANCH_ADMIN:
        if body.branch_id is not None and body.branch_id != current.branch_id:
            raise ForbiddenError(
                "You cannot move users to another branch", code="branch_forbidden"
            )
        if body.role in (UserRole.BRANCH_ADMIN, UserRole.SUPER_ADMIN):
            raise ForbiddenError("You cannot assign admin roles", code="role_forbidden")
    return await users_crud.update_user(db, target.id, body, actor=current, device=device)


@router.post("/{user_id}/reset-password", response_model=MessageResponse)
async def admin_reset_password_route(
    body: AdminResetPasswordRequest,
    target=Depends(scoped_user),
    db: AsyncSession = Depends(get_db),
    current=Depends(require_admin),
    device: dict = Depends(device_dep),
):
    await users_crud.reset_password(
        db, target.id, body.new_password, actor=current, device=device
    )
    return MessageResponse(message="Password reset")


@router.patch("/{user_id}/status", response_model=UserResponse)
async def set_status_route(
    body: StatusUpdate,
    target=Depends(scoped_user),
    db: AsyncSession = Depends(get_db),
    current=Depends(require_admin),
    device: dict = Depends(device_dep),
):
    return await users_crud.set_user_status(
        db, target.id, body.status, actor=current, device=device
    )


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user_route(
    target=Depends(scoped_user),
    db: AsyncSession = Depends(get_db),
    current=Depends(require_admin),
    device: dict = Depends(device_dep),
):
    await users_crud.delete_user(db, target.id, actor=current, device=device)
    return MessageResponse(message="User deleted")