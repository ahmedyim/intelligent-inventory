"""
Inventory router: thin. Business rules live in app.crud.inventory.
Static paths (/low-stock, /movements, ...) MUST stay above "/{inventory_id}".
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.core.device import get_device_info
from app.crud import inventory as crud
from app.models.stock_movement import MovementType
from app.models.users import UserModel
from app.schemas.inventory import (
    InventoryCreate,
    InventoryList,
    InventoryRead,
    InventoryUpdate,
    InventoryWithProduct,
    LowStockItem,
    MovementList,
    MovementRead,
    StockAdjust,
    StockIssue,
    StockReceive,
)

router = APIRouter(prefix="", tags=["inventory"])


# ---------------- stock operations ----------------
@router.post("/receive", response_model=InventoryRead, status_code=status.HTTP_201_CREATED)
async def receive_stock(
    payload: StockReceive,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Stock IN: new delivery with its own cost, optional new selling price."""
    return await crud.receive_stock(db, payload, actor=actor, device=device)


@router.post("/issue", response_model=InventoryRead)
async def issue_stock(
    payload: StockIssue,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Stock OUT: sale, damage, loss. 409 if not enough stock."""
    return await crud.issue_stock(db, payload, actor=actor, device=device)


@router.post("/adjust", response_model=InventoryRead)
async def adjust_stock(
    payload: StockAdjust,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Stock take: send the counted quantity, the backend records the difference."""
    return await crud.adjust_stock(db, payload, actor=actor, device=device)


# ---------------- reports (static paths first) ----------------
@router.get("/low-stock", response_model=list[LowStockItem])
async def low_stock(
    branch_id: Optional[uuid.UUID] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    rows, _total = await crud.list_low_stock(db, branch_id=branch_id, skip=skip, limit=limit)
    return [LowStockItem.model_validate(r) for r in rows]


@router.get("/movements", response_model=MovementList)
async def list_movements(
    product_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    reason: Optional[str] = None,
    movement_type: Optional[MovementType] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    rows, total = await crud.list_movements(
        db, product_id=product_id, branch_id=branch_id, reason=reason,
        movement_type=movement_type, skip=skip, limit=limit,
    )
    return MovementList(
        items=[MovementRead.model_validate(r) for r in rows],
        total=total, skip=skip, limit=limit,
    )


# ---------------- inventory rows ----------------
@router.post("", response_model=InventoryRead, status_code=status.HTTP_201_CREATED)
async def create_inventory(
    payload: InventoryCreate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Create an empty stock row (qty 0) for a product in a branch."""
    return await crud.create_inventory(db, payload, actor=actor, device=device)


@router.get("", response_model=InventoryList)
async def list_inventory(
    branch_id: Optional[uuid.UUID] = None,
    product_id: Optional[uuid.UUID] = None,
    search: Optional[str] = Query(None, description="Name, SKU or barcode"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    rows, total = await crud.list_inventory(
        db, branch_id=branch_id, product_id=product_id, search=search, skip=skip, limit=limit
    )
    return InventoryList(
        items=[InventoryWithProduct.model_validate(r) for r in rows],
        total=total, skip=skip, limit=limit,
    )


@router.get("/{inventory_id}", response_model=InventoryWithProduct)
async def get_inventory(
    inventory_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    return await crud.get_inventory_or_404(db, inventory_id)


@router.patch("/{inventory_id}", response_model=InventoryWithProduct)
async def update_inventory(
    inventory_id: uuid.UUID,
    payload: InventoryUpdate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Change settings only (reorder level). Quantity changes go through receive/issue/adjust."""
    return await crud.update_inventory(db, inventory_id, payload, actor=actor, device=device)