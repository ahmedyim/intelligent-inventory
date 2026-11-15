from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.users import UserModel, UserRole
from app.schemas.category import (
    CategoryCreate,
    CategoryUpdate,
    CategoryResponse,
)
from app.crud import categories as crud_categories
from app.core.device import  get_device_info
from app.core.dependencies import get_current_user,require_role
from app.core.db import get_db
router = APIRouter(prefix="", tags=["Categories"])


@router.get("/", response_model=list[CategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    categories, _ = await crud_categories.list_categories(
        db, is_active=is_active, search=search, skip=skip, limit=limit
    )
    return categories


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: int, db: AsyncSession = Depends(get_db)):
    category = await crud_categories.get_category_by_id(db, category_id)
    if not category:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Category not found", code="category_not_found")
    return category


@router.post("/", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    category_in: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
    device: dict = Depends(get_device_info),
):
    return await crud_categories.create_category(
        db, category_in, actor=current_user, device=device
    )


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    category_in: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(require_role([UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN])),
    device: dict = Depends(get_device_info),
):
    return await crud_categories.update_category(
        db, category_id, category_in, actor=current_user, device=device
    )


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(require_role([UserRole.SUPER_ADMIN])),
    device: dict = Depends(get_device_info),
):
    await crud_categories.delete_category(
        db, category_id, actor=current_user, device=device
    )
    return None