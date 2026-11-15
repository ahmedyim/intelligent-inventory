import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.dependencies import get_current_user
from app.core.exceptions import BadRequestError, ForbiddenError
from app.crud import seller as seller_crud
from app.models.users import UserModel
from app.schemas.seller import PosStockList

router = APIRouter(prefix="", tags=["pos"])


@router.get("/products", response_model=PosStockList)
async def pos_products(
    branch_id: Optional[uuid.UUID] = None,
    search: Optional[str] = Query(None, max_length=60, description="Name, SKU or barcode"),
    low_stock: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    actor: UserModel = Depends(get_current_user),
):
    """Sellable products of ONE branch with their stock and selling price. Never any cost."""
    if str(getattr(actor.role, "value", actor.role)) == "SUPER_ADMIN":
        if not branch_id:
            raise BadRequestError("Choose a branch", code="branch_required")
        scope = branch_id
    else:
        if not actor.branch_id:
            raise ForbiddenError("Your account has no branch", code="no_branch")
        scope = actor.branch_id    # whatever the client sent is ignored

    return await seller_crud.list_pos_stock(
        db, branch_id=scope, search=search, low_stock=low_stock, skip=skip, limit=limit
    )