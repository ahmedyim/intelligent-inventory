"""
Thin router: validate input, check permissions, call crud, return result.
No business rules here.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user,require_admin
from app.core.device import get_device_info
from app.core.db import get_db
from app.models.users import UserModel
from app.schemas.users import UserRole
from app.schemas.supplier import (
    SupplierCreate,
    SupplierList,
    SupplierRead,
    SupplierStatusUpdate,
    SupplierUpdate,
)
from app.crud import suppliers as crud

router = APIRouter(prefix="", tags=["Suppliers"])



@router.post("", response_model=SupplierRead, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    supplier_in: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(require_admin),
    device: dict = Depends(get_device_info),
):
    return await crud.create_supplier(db, supplier_in, actor=actor, device=device)


@router.get("", response_model=SupplierList)
async def list_suppliers(
    is_active: Optional[bool] = None,
    search: Optional[str] = Query(None, max_length=100),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    items, total = await crud.list_suppliers(
        db, is_active=is_active, search=search, skip=skip, limit=limit
    )
    return SupplierList(items=items, total=total, skip=skip, limit=limit)


@router.get("/{supplier_id}", response_model=SupplierRead)
async def get_supplier(
    supplier_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    return await crud.get_supplier_or_404(db, supplier_id)


@router.patch("/{supplier_id}", response_model=SupplierRead)
async def update_supplier(
    supplier_id: uuid.UUID,
    supplier_in: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel =Depends(require_admin),
    device: dict = Depends(get_device_info),
):
    return await crud.update_supplier(
        db, supplier_id, supplier_in, actor=actor, device=device
    )


@router.patch("/{supplier_id}/status", response_model=SupplierRead)
async def set_supplier_status(
    supplier_id: uuid.UUID,
    body: SupplierStatusUpdate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(require_admin),
    device: dict = Depends(get_device_info),
):
    return await crud.set_supplier_status(
        db, supplier_id, body.is_active, actor=actor, device=device
    )


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(
    supplier_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(require_admin),
    device: dict = Depends(get_device_info),
):
    await crud.delete_supplier(db, supplier_id, actor=actor, device=device)