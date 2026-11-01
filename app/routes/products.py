"""
Product router: thin. No business rules here, only HTTP wiring.
Errors (NotFoundError, ConflictError, ...) are turned into HTTP responses
by your global exception handlers.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.device import get_device_info
from app.core.db import get_db
from app.crud import products as crud
from app.core.exceptions import NotFoundError
from app.models.users import UserModel
from app.schemas.products import ProductCreate, ProductList, ProductRead, ProductUpdate

router = APIRouter(prefix="", tags=["products"])


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    """Create a product. Send `initial_stock` to also create its first stock."""
    return await crud.create_product(db, payload, actor=actor, device=device)


@router.get("", response_model=ProductList)
async def list_products(
    category_id: Optional[uuid.UUID] = None,
    supplier_id: Optional[uuid.UUID] = None,
    is_active: Optional[bool] = True,
    search: Optional[str] = Query(None, description="Name, SKU or barcode"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    rows, total = await crud.list_products(
        db,
        category_id=category_id,
        supplier_id=supplier_id,
        is_active=is_active,
        search=search,
        skip=skip,
        limit=limit,
    )
    return ProductList(
        items=[ProductRead.model_validate(p) for p in rows],
        total=total,
        skip=skip,
        limit=limit,
    )


# NOTE: must stay ABOVE "/{product_id}", otherwise "by-barcode" is parsed as a UUID.
@router.get("/by-barcode/{barcode}", response_model=ProductRead)
async def get_product_by_barcode(
    barcode: str,
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    product = await crud.get_product_by_barcode(db, barcode)
    if not product:
        raise NotFoundError("Product not found", code="product_not_found")
    return product


@router.get("/{product_id}", response_model=ProductRead)
async def get_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: UserModel = Depends(get_current_user),
):
    return await crud.get_product_or_404(db, product_id)


@router.patch("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    return await crud.update_product(db, product_id, payload, actor=actor, device=device)


@router.post("/{product_id}/activate", response_model=ProductRead)
async def activate_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    return await crud.set_product_active(db, product_id, True, actor=actor, device=device)


@router.post("/{product_id}/deactivate", response_model=ProductRead)
async def deactivate_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    return await crud.set_product_active(db, product_id, False, actor=actor, device=device)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
    device: dict = Depends(get_device_info),
):
    await crud.delete_product(db, product_id, actor=actor, device=device)