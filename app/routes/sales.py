import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.core.device import get_device_info
from app.crud import sales as crud
from app.models.sales import SaleStatus
from app.models.users import UserModel
from app.schemas.sales import SaleCreate, SaleList, SaleRead, SaleVoid

router = APIRouter(prefix="", tags=["sales"])


@router.post("", response_model=SaleRead, status_code=status.HTTP_201_CREATED)
async def create_sale(
    payload: SaleCreate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Sell products. Reduces stock and records price/cost per line. All or nothing."""
    return await crud.create_sale(db, payload, actor=actor, device=device)


@router.get("", response_model=SaleList)
async def list_sales(
    branch_id: Optional[uuid.UUID] = None,
    status_: Optional[SaleStatus] = Query(None, alias="status"),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    rows, total = await crud.list_sales(
        db, branch_id=branch_id, status=status_, date_from=date_from,
        date_to=date_to, skip=skip, limit=limit,
    )
    return SaleList(
        items=[SaleRead.model_validate(r) for r in rows], total=total, skip=skip, limit=limit
    )


@router.get("/{sale_id}", response_model=SaleRead)
async def get_sale(
    sale_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    return await crud.get_sale_or_404(db, sale_id)


@router.post("/{sale_id}/void", response_model=SaleRead)
async def void_sale(
    sale_id: uuid.UUID,
    payload: SaleVoid = Body(default_factory=SaleVoid),
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Cancel a sale and return its stock. Restrict to managers."""
    return await crud.void_sale(db, sale_id, payload.reason, actor=actor, device=device)