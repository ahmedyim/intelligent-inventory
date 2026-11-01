"""
Payment method router: thin. Business rules live in app.crud.payment_methods.
"""
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.core.device import get_device_info
from app.crud import payment_methods as crud
from app.models.users import UserModel
from app.schemas.payment_methods import (
    PaymentMethodCreate,
    PaymentMethodRead,
    PaymentMethodUpdate,
)

router = APIRouter(prefix="", tags=["payment-methods"])


@router.get("", response_model=list[PaymentMethodRead])
async def list_payment_methods(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    """Load on the pay screen: names and account numbers to show the customer."""
    return await crud.list_methods(db, only_active=not include_inactive)


@router.post("", response_model=PaymentMethodRead, status_code=status.HTTP_201_CREATED)
async def create_payment_method(
    payload: PaymentMethodCreate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),   # restrict to managers
    device: dict = Depends(get_device_info),
):
    return await crud.create_method(db, payload, actor=actor, device=device)


@router.get("/{method_id}", response_model=PaymentMethodRead)
async def get_payment_method(
    method_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    return await crud.get_method_or_404(db, method_id)


@router.patch("/{method_id}", response_model=PaymentMethodRead)
async def update_payment_method(
    method_id: uuid.UUID,
    payload: PaymentMethodUpdate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),   # restrict to managers
    device: dict = Depends(get_device_info),
):
    """Set account numbers, rename, disable or enable, reorder."""
    return await crud.update_method(db, method_id, payload, actor=actor, device=device)