import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.dependencies import get_current_user, require_admin
from app.core.device import get_device_info
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.crud import sales as crud
from app.crud import sales_overview as overview_crud
from app.crud import seller as seller_crud
from app.models.sales import PaymentStatus, SaleStatus
from app.models.users import UserModel
from app.schemas.sales import (
    SaleCreate, SaleDetail, SaleList, SaleRead, SalesOverview, SalesPeriod, SaleVoid,
)
from app.schemas.seller import MySalesOverview, SaleCreated, SaleReceipt, SaleRefund

router = APIRouter(prefix="", tags=["sales"])


def _role(user: UserModel) -> str:
    return str(getattr(user.role, "value", user.role))


def _scope(actor: UserModel, branch_id, created_by):
    """Super admin: whatever they ask for. Branch admin: their own branch only.
    Seller: only their own sales. Client values are ignored for the locked fields."""
    role = _role(actor)
    if role == "SUPER_ADMIN":
        return branch_id, created_by
    if role == "BRANCH_ADMIN":
        if not actor.branch_id:
            raise ForbiddenError("Your account has no branch", code="no_branch")
        return actor.branch_id, created_by
    return actor.branch_id, actor.id


def _ensure_can_view(actor: UserModel, sale) -> None:
    role = _role(actor)
    allowed = (
        role == "SUPER_ADMIN"
        or (role == "BRANCH_ADMIN" and actor.branch_id == sale.branch_id)
        or (role == "SELLER" and sale.created_by == actor.id)
    )
    if not allowed:   # same answer as a missing sale, so ids do not leak
        raise NotFoundError("Sale not found", code="sale_not_found")


@router.post("", response_model=SaleCreated, status_code=status.HTTP_201_CREATED)
async def create_sale(
    payload: SaleCreate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Sell products. Reduces stock and records price/cost per line. All or nothing.
    The response never includes cost."""
    if _role(actor) != "SUPER_ADMIN" and payload.branch_id != actor.branch_id:
        raise ForbiddenError("You can only sell from your own branch", code="branch_forbidden")
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
    actor: UserModel = Depends(require_admin),          # includes cost: admins only
):
    branch_id, created_by = _scope(actor, branch_id, None)
    rows, total = await crud.list_sales(
        db, branch_id=branch_id, created_by=created_by, status=status_,
        date_from=date_from, date_to=date_to, skip=skip, limit=limit,
    )
    return SaleList(
        items=[SaleRead.model_validate(r) for r in rows], total=total, skip=skip, limit=limit
    )


# NOTE: fixed paths ("/overview", "/mine") must stay ABOVE "/{sale_id}", or they are parsed as a UUID.
@router.get("/overview", response_model=SalesOverview)
async def sales_overview(
    period: SalesPeriod = Query(SalesPeriod.month),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    branch_id: Optional[uuid.UUID] = None,
    created_by: Optional[uuid.UUID] = Query(None, description="Staff member"),
    customer_id: Optional[uuid.UUID] = None,
    status_: Optional[SaleStatus] = Query(None, alias="status"),
    payment_status: Optional[PaymentStatus] = None,
    payment_method: Optional[str] = Query(None, max_length=50),
    search: Optional[str] = Query(None, max_length=50),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(require_admin),
):
    if date_from and date_to and date_from > date_to:
        raise BadRequestError("The start date is after the end date", code="invalid_date_range")
    branch_id, created_by = _scope(actor, branch_id, created_by)
    return await overview_crud.get_overview(
        db, period=period, date_from=date_from, date_to=date_to, branch_id=branch_id,
        created_by=created_by, customer_id=customer_id, status=status_,
        payment_status=payment_status, payment_method=payment_method, search=search,
        skip=skip, limit=limit,
    )


@router.get("/mine", response_model=MySalesOverview)
async def my_sales(
    period: SalesPeriod = Query(SalesPeriod.today),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status_: Optional[SaleStatus] = Query(None, alias="status"),
    payment_status: Optional[PaymentStatus] = None,
    payment_method: Optional[str] = Query(None, max_length=50),
    search: Optional[str] = Query(None, max_length=50),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
):
    """The signed-in user's OWN sales (no cost, no profit). Used by the seller screens."""
    if date_from and date_to and date_from > date_to:
        raise BadRequestError("The start date is after the end date", code="invalid_date_range")
    return await seller_crud.get_my_sales(
        db, actor, period=period, date_from=date_from, date_to=date_to, status=status_,
        payment_status=payment_status, payment_method=payment_method, search=search,
        skip=skip, limit=limit,
    )


@router.get("/{sale_id}", response_model=SaleRead)
async def get_sale(
    sale_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(require_admin),
):
    sale = await crud.get_sale_or_404(db, sale_id)
    _ensure_can_view(actor, sale)
    return sale


@router.get("/{sale_id}/detail", response_model=SaleDetail)
async def get_sale_detail(
    sale_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(require_admin),          # cost and profit: admins only
):
    sale = await crud.get_sale_or_404(db, sale_id)
    _ensure_can_view(actor, sale)
    return await overview_crud.get_detail(db, sale_id)


@router.get("/{sale_id}/receipt", response_model=SaleReceipt)
async def get_sale_receipt(
    sale_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
):
    """One sale without cost or profit, plus whether the caller may refund it."""
    sale = await crud.get_sale_or_404(db, sale_id)
    _ensure_can_view(actor, sale)
    return await seller_crud.build_receipt(db, actor, sale)


@router.post("/{sale_id}/void", response_model=SaleRead)
async def void_sale(
    sale_id: uuid.UUID,
    payload: SaleVoid = Body(default_factory=SaleVoid),
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(require_admin),
    device: dict = Depends(get_device_info),
):
    """Cancel a sale and return its stock. Admins only; a branch admin only in their branch."""
    sale = await crud.get_sale_or_404(db, sale_id)
    _ensure_can_view(actor, sale)
    return await crud.void_sale(db, sale_id, payload.reason, actor=actor, device=device)


@router.post("/{sale_id}/refund", response_model=SaleReceipt)
async def refund_sale(
    sale_id: uuid.UUID,
    payload: SaleRefund,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Refund a sale: items go back to stock and payments are refunded.
    Sellers: their own sales, inside the refund window, with a reason. Admins: any sale in their scope."""
    sale = await crud.get_sale_or_404(db, sale_id)
    _ensure_can_view(actor, sale)
    return await seller_crud.refund_sale(db, actor, sale_id, payload.reason, device=device)