from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.stock_movement import MovementType
from app.schemas.products import ProductRead


class InventoryCreate(BaseModel):
    # creates the stock row at 0; add stock later via a StockMovement (IN)
    product_id: UUID
    branch_id: UUID
    reorder_level: int | None = Field(default=None, ge=0)


class InventoryUpdate(BaseModel):
    # only settings can be changed here, never quantity
    reorder_level: int | None = Field(default=None, ge=0)


class InventoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    branch_id: UUID
    quantity: int
    reorder_level: int | None
    last_counted_at: datetime | None
    updated_at: datetime


class InventoryWithProduct(InventoryRead):
    product: ProductRead


class LowStockItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: UUID
    product_name: str
    sku: str
    branch_id: UUID
    quantity: int
    reorder_level: int


# ---------- new: lists ----------
class InventoryList(BaseModel):
    items: list[InventoryWithProduct]
    total: int
    skip: int
    limit: int


# ---------- new: stock operations ----------
class StockReceive(BaseModel):
    product_id: UUID
    branch_id: UUID
    quantity: int = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)  # cost of THIS delivery
    new_selling_price: Decimal | None = Field(default=None, ge=0)
    reason: str = Field(default="purchase", max_length=50)
    note: str | None = None


class StockIssue(BaseModel):
    product_id: UUID
    branch_id: UUID
    quantity: int = Field(gt=0)
    reason: str = Field(pattern="^(sale|damage|loss|expired|other)$")
    note: str | None = None


class StockAdjust(BaseModel):
    product_id: UUID
    branch_id: UUID
    counted_quantity: int = Field(ge=0)  # what was physically counted
    note: str | None = None


# ---------- new: movement history ----------
class MovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    inventory_id: UUID
    product_id: UUID
    branch_id: UUID
    movement_type: MovementType
    quantity_change: int
    quantity_before: int
    quantity_after: int
    unit_cost: Decimal | None
    unit_price: Decimal | None
    reason: str
    note: str | None
    created_by: UUID | None
    created_at: datetime


class MovementList(BaseModel):
    items: list[MovementRead]
    total: int
    skip: int
    limit: int