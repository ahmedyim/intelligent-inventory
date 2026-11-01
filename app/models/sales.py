import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, Date, DateTime, Enum as SAEnum, ForeignKey, Integer,
    Numeric, String, Text, Uuid, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.customers import Customer
from app.models.payment_methods import PaymentMethod
from app.core.db import Base


class SaleStatus(str, enum.Enum):
    COMPLETED = "COMPLETED"
    VOIDED = "VOIDED"


class PaymentStatus(str, enum.Enum):
    PAID = "PAID"
    PARTIAL = "PARTIAL"
    UNPAID = "UNPAID"


class Sale(Base):
    __tablename__ = "sales"
    __table_args__ = (
        CheckConstraint("total >= 0", name="ck_sale_total_non_negative"),
        CheckConstraint("balance_due >= 0", name="ck_sale_balance_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id"), nullable=True, index=True
    )  # optional when fully paid, required for credit

    status: Mapped[SaleStatus] = mapped_column(
        SAEnum(SaleStatus, name="sale_status"), default=SaleStatus.COMPLETED
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status"),
        default=PaymentStatus.PAID,
        server_default=PaymentStatus.PAID.value,
        index=True,
    )
    # summary only: cash, telebirr, mixed, credit ... (real data is in `payments`)
    payment_method: Mapped[str] = mapped_column(String(20), default="cash")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    balance_due: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    voided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    payments = relationship(
        "Payment",
        back_populates="sale",
        cascade="all, delete-orphan",
        order_by="Payment.created_at",
    )
    customer = relationship("Customer")


class SaleItem(Base):
    __tablename__ = "sale_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_sale_item_qty_positive"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales.id"), index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), index=True)

    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # snapshot at sale time
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2))   # snapshot, for profit
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    sale = relationship("Sale", back_populates="items")
    product = relationship("Product")


class Payment(Base):
    """Append-only: money in (+) or money back (-, refund on void). Never edited."""
    __tablename__ = "payments"
    __table_args__ = (CheckConstraint("amount <> 0", name="ck_payment_nonzero"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sale_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales.id"), index=True)
    payment_method_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payment_methods.id"), nullable=True, index=True
    )
    # snapshot of PaymentMethod.code at payment time, so reports survive renames
    method: Mapped[str] = mapped_column(String(20), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)  # transaction ID
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sale = relationship("Sale", back_populates="payments")
    payment_method = relationship("PaymentMethod")