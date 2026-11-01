from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.sales import PaymentStatus, SaleStatus


# ---------------- payments ----------------
class PaymentIn(BaseModel):
    payment_method_id: UUID
    amount: Decimal = Field(gt=0)
    reference: str | None = Field(default=None, max_length=100)  # transaction ID
    note: str | None = None


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sale_id: UUID
    payment_method_id: UUID | None
    method: str                      # code snapshot: "telebirr"
    amount: Decimal
    reference: str | None
    note: str | None
    received_by: UUID | None
    created_at: datetime


class PaymentMethodTotal(BaseModel):
    method: str
    total: Decimal
    count: int


# ---------------- sale items ----------------
class SaleItemIn(BaseModel):
    product_id: UUID
    quantity: int = Field(gt=0)


class SaleItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    quantity: int
    unit_price: Decimal
    unit_cost: Decimal
    line_total: Decimal


# ---------------- sales ----------------
class SaleCreate(BaseModel):
    branch_id: UUID
    items: list[SaleItemIn] = Field(min_length=1)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    # what the customer pays NOW. Empty list = everything on credit.
    payments: list[PaymentIn] = Field(default_factory=list)
    # required when payments < total (credit sale); optional when fully paid
    customer_id: UUID | None = None
    due_date: date | None = None     # required when there is a balance
    note: str | None = None


class SaleVoid(BaseModel):
    reason: str | None = None


class SaleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sale_number: str
    branch_id: UUID
    customer_id: UUID | None
    status: SaleStatus
    payment_status: PaymentStatus
    payment_method: str              # summary: cash, telebirr, mixed, credit
    note: str | None
    subtotal: Decimal
    discount: Decimal
    total: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    due_date: date | None
    created_by: UUID | None
    created_at: datetime
    voided_at: datetime | None
    items: list[SaleItemRead]
    payments: list[PaymentRead]


class SaleList(BaseModel):
    items: list[SaleRead]
    total: int
    skip: int
    limit: int