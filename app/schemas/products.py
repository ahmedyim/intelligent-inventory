from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.stock_movements import InitialStock


class ProductBase(BaseModel):
    sku: str = Field(min_length=1, max_length=50)
    barcode: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=150)
    description: str | None = None
    unit: str = Field(default="pcs", max_length=20)
    category_id: UUID | None = None
    supplier_id: UUID | None = None
    cost_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    selling_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    reorder_level: int = Field(default=10, ge=0)
    lead_time_days: int = Field(default=7, ge=0)


class ProductCreate(ProductBase):
    # Optional opening stock. When given, create_product also creates the
    # inventory row and an "initial_stock" stock movement in the same transaction.
    initial_stock: InitialStock | None = None


# Fields that are NOT nullable in the DB: client may omit them, but not send null.
_NON_NULLABLE = {
    "sku", "name", "unit", "cost_price", "selling_price",
    "reorder_level", "lead_time_days", "is_active",
}


class ProductUpdate(BaseModel):
    """PATCH payload: every field optional.
    Stock is NOT changed here; use the stock movement endpoints for that."""

    sku: str | None = Field(default=None, min_length=1, max_length=50)
    barcode: str | None = Field(default=None, max_length=64)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    unit: str | None = Field(default=None, max_length=20)
    category_id: UUID | None = None
    supplier_id: UUID | None = None
    cost_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    selling_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    reorder_level: int | None = Field(default=None, ge=0)
    lead_time_days: int | None = Field(default=None, ge=0)
    is_active: bool | None = None

    @model_validator(mode="after")
    def reject_null_for_required_columns(self):
        for field in self.model_fields_set & _NON_NULLABLE:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ProductRead(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProductList(BaseModel):
    items: list[ProductRead]
    total: int
    skip: int
    limit: int