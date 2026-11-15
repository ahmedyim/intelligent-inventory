import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)   # cash, telebirr, cbe
    name: Mapped[str] = mapped_column(String(80))                            # "Telebirr", "CBE"
    type: Mapped[str] = mapped_column(String(20), default="bank")            # cash | mobile_money | bank
    account_number: Mapped[str | None] = mapped_column(String(60), nullable=True)  # shown to customer
    account_name: Mapped[str | None] = mapped_column(String(120), nullable=True)   # account holder
    requires_reference: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())