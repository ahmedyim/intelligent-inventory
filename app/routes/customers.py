import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.core.device import get_device_info
from app.crud import customers as crud
from app.models.users import UserModel
from app.schemas.customers import (
    CustomerCreate, CustomerList, CustomerRead, CustomerUpdate, CustomerWithBalance,
)

router = APIRouter(prefix="", tags=["customers"])


@router.post("", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    return await crud.create_customer(db, payload, actor=actor, device=device)


@router.get("", response_model=CustomerList)
async def list_customers(
    search: Optional[str] = Query(None, description="Name or phone"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    rows, total = await crud.list_customers(db, search=search, skip=skip, limit=limit)
    return CustomerList(
        items=[CustomerRead.model_validate(r) for r in rows], total=total, skip=skip, limit=limit
    )


@router.get("/{customer_id}", response_model=CustomerWithBalance)
async def get_customer(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    """Customer with what they owe now and how much credit is left."""
    c = await crud.get_customer_or_404(db, customer_id)
    outstanding = await crud.get_outstanding(db, customer_id)
    base = CustomerRead.model_validate(c).model_dump()
    return CustomerWithBalance(
        **base,
        outstanding=outstanding,
        available_credit=max(c.credit_limit - outstanding, Decimal("0")),
    )


@router.patch("/{customer_id}", response_model=CustomerRead)
async def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    return await crud.update_customer(db, customer_id, payload, actor=actor, device=device)