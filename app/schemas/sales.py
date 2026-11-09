from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from enum import Enum
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
    
    
class SalesPeriod(str, Enum):
    today = "today"
    yesterday = "yesterday"
    week = "week"
    month = "month"
    last_month = "last_month"
    year = "year"
    all = "all"


class SaleRow(BaseModel):
    id: UUID
    sale_number: str
    branch_id: UUID
    branch_name: str | None = None
    customer_id: UUID | None = None
    customer_name: str | None = None
    staff_id: UUID | None = None
    staff_name: str | None = None
    status: SaleStatus
    payment_status: PaymentStatus
    payment_method: str
    total: float
    discount: float
    amount_paid: float
    balance_due: float
    due_date: date | None = None
    items_count: int
    units: int
    cost: float
    profit: float
    created_at: datetime


class MethodSummary(BaseModel):
    method: str
    total: float
    count: int


class SalesSummary(BaseModel):
    # money figures describe COMPLETED sales only; the status filter affects the table
    sales_count: int
    revenue: float
    cost: float
    profit: float
    discount: float
    paid: float
    balance_due: float
    overdue_count: int
    overdue_amount: float
    voided_count: int
    voided_total: float
    by_method: list[MethodSummary]


class SalesOverview(BaseModel):
    items: list[SaleRow]
    total: int
    skip: int
    limit: int
    summary: SalesSummary
    methods: list[str]                 # payment method codes for the filter
    window_start: date | None = None   # the real range that was applied
    window_end: date | None = None


class SaleItemDetail(BaseModel):
    id: UUID
    product_id: UUID
    product_name: str | None = None
    sku: str | None = None
    image_url: str | None = None
    quantity: int
    unit_price: float
    unit_cost: float
    line_total: float
    profit: float


class PaymentDetail(BaseModel):
    id: UUID
    method: str
    amount: float                      # refunds are negative
    reference: str | None = None
    note: str | None = None
    received_by_name: str | None = None
    created_at: datetime


class SaleDetail(BaseModel):
    id: UUID
    sale_number: str
    branch_id: UUID
    branch_name: str | None = None
    customer_id: UUID | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    staff_id: UUID | None = None
    staff_name: str | None = None
    status: SaleStatus
    payment_status: PaymentStatus
    payment_method: str
    note: str | None = None
    subtotal: float
    discount: float
    total: float
    amount_paid: float
    balance_due: float
    due_date: date | None = None
    created_at: datetime
    voided_at: datetime | None = None
    voided_by_name: str | None = None
    cost: float
    profit: float
    items: list[SaleItemDetail]
    payments: list[PaymentDetail]