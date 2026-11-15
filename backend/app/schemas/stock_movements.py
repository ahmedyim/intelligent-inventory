import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.stock_movement import MovementType


class InitialStock(BaseModel):
    """Used inside ProductCreate: `initial_stock: Optional[InitialStock] = None`.
    quantity must be > 0, so zero/negative values fail with 422 before any DB work."""
    branch_id: uuid.UUID
    quantity: int = Field(gt=0)


class StockMovementCreate(BaseModel):
    """Manual stock change (restock, damage, count correction)."""
    product_id: uuid.UUID
    branch_id: uuid.UUID
    quantity_change: int = Field(description="Positive adds stock, negative removes it")
    reason: str = Field(min_length=1, max_length=50)
    note: Optional[str] = Field(default=None, max_length=500)
    movement_type: Optional[MovementType] = None  # auto IN/OUT when omitted

    @field_validator("quantity_change")
    @classmethod
    def not_zero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("quantity_change cannot be zero")
        return v

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, v: str) -> str:
        return v.strip().lower().replace(" ", "_")


class StockMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    inventory_id: uuid.UUID
    product_id: uuid.UUID
    branch_id: uuid.UUID
    movement_type: MovementType
    quantity_change: int
    quantity_before: int
    quantity_after: int
    reason: str
    note: Optional[str] = None
    created_by: Optional[uuid.UUID] = None
    created_at: datetime


class StockMovementList(BaseModel):
    items: list[StockMovementRead]
    total: int