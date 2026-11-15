import datetime as dt
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.sales import PaymentStatus, SaleStatus
from app.schemas.sales import MethodSummary


# ---------------- products for the POS and the seller catalog: never any cost ----------------
class PosProduct(BaseModel):
    id: UUID
    sku: str
    barcode: str | None = None
    name: str
    unit: str
    image_url: str | None = None
    selling_price: float
    reorder_level: int
    is_active: bool


class PosStockItem(BaseModel):
    id: UUID                        # inventory row id
    branch_id: UUID
    quantity: int
    reorder_level: int | None = None
    product: PosProduct


class PosStockList(BaseModel):
    items: list[PosStockItem]
    total: int
    skip: int
    limit: int


# ---------------- the sale returned by POST /sales (no cost fields) ----------------
class SaleCreatedItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    product_id: UUID
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class SaleCreated(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sale_number: str
    subtotal: Decimal
    discount: Decimal
    total: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    due_date: dt.date | None = None
    created_at: dt.datetime
    items: list[SaleCreatedItem]


# ---------------- "my sales" ----------------
class MySaleRow(BaseModel):
    id: UUID
    sale_number: str
    customer_name: str | None = None
    status: SaleStatus
    payment_status: PaymentStatus
    payment_method: str
    total: float
    discount: float
    amount_paid: float
    balance_due: float
    due_date: dt.date | None = None
    items_count: int
    units: int
    created_at: dt.datetime
    can_refund: bool


class MySalesSummary(BaseModel):
    sales_count: int
    total: float
    discount: float
    paid: float
    balance_due: float
    overdue_count: int
    overdue_amount: float
    voided_count: int
    voided_total: float
    by_method: list[MethodSummary]


class MySalesOverview(BaseModel):
    items: list[MySaleRow]
    total: int
    skip: int
    limit: int
    summary: MySalesSummary
    methods: list[str]
    window_start: dt.date | None = None
    window_end: dt.date | None = None
    refund_window_hours: int


# ---------------- one sale, without cost or profit ----------------
class ReceiptItem(BaseModel):
    id: UUID
    product_id: UUID
    product_name: str | None = None
    sku: str | None = None
    image_url: str | None = None
    quantity: int
    unit_price: float
    line_total: float


class ReceiptPayment(BaseModel):
    id: UUID
    method: str
    amount: float                   # refunds are negative
    reference: str | None = None
    note: str | None = None
    received_by_name: str | None = None
    created_at: dt.datetime


class SaleReceipt(BaseModel):
    id: UUID
    sale_number: str
    branch_id: UUID
    branch_name: str | None = None
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
    due_date: dt.date | None = None
    created_at: dt.datetime
    voided_at: dt.datetime | None = None
    voided_by_name: str | None = None
    items: list[ReceiptItem]
    payments: list[ReceiptPayment]
    can_refund: bool
    refund_deadline: dt.datetime | None = None
    refund_blocked_reason: str | None = None


class SaleRefund(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)]