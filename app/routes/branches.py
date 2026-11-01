"""
Branch router: thin. No business rules here, only HTTP wiring.
Errors (NotFoundError, ConflictError, ...) are turned into HTTP responses
by your global exception handlers.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.device import  get_device_info
from app.core.dependencies import get_current_user,require_role
from app.core.db import get_db
from app.core.exceptions import NotFoundError
from app.crud import branches as crud
from app.models.users import UserModel
from app.schemas.branches import (
    BranchCreate,
    BranchListResponse,
    BranchResponse,
    BranchUpdate,
)
from app.schemas.users import UserRole

router = APIRouter(prefix="", tags=["branches"])

# Only the super admin may create, edit or delete branches.
super_admin_only = require_role(UserRole.SUPER_ADMIN)


@router.post("", response_model=BranchResponse, status_code=status.HTTP_201_CREATED)
async def create_branch(
    payload: BranchCreate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(super_admin_only),
    device: dict = Depends(get_device_info),
):
    return await crud.create_branch(db, payload, actor=actor, device=device)


@router.get("", response_model=BranchListResponse)
async def list_branches(
    search: Optional[str] = Query(None, description="Name, location or email"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    rows, total = await crud.list_branches(db, search=search, skip=skip, limit=limit)
    return BranchListResponse(
        items=[BranchResponse.model_validate(b) for b in rows],
        total=total,
    )


@router.get("/{branch_id}", response_model=BranchResponse)
async def get_branch(
    branch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    branch = await crud.get_branch_by_id(db, branch_id)
    if not branch:
        raise NotFoundError("Branch not found", code="branch_not_found")
    return branch


@router.patch("/{branch_id}", response_model=BranchResponse)
async def update_branch(
    branch_id: uuid.UUID,
    payload: BranchUpdate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(super_admin_only),
    device: dict = Depends(get_device_info),
):
    return await crud.update_branch(db, branch_id, payload, actor=actor, device=device)


@router.delete("/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_branch(
    branch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(super_admin_only),
    device: dict = Depends(get_device_info),
):
    await crud.delete_branch(db, branch_id, actor=actor, device=device)