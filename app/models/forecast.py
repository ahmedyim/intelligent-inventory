import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint, DateTime, Enum as SAEnum, ForeignKey, Index, Integer, String, Text, Uuid, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Urgency(str, enum.Enum):          # definition order = sort order (critical first)
    CRITICAL = "CRITICAL"
    SOON = "SOON"


class Confidence(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class SuggestionStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DISMISSED = "DISMISSED"


class ReorderSuggestion(Base):
    __tablename__ = "reorder_suggestions"
    __table_args__ = (
        CheckConstraint("suggested_qty >= 0", name="ck_suggestion_qty_non_negative"),
        Index("ix_suggestion_branch_status", "branch_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)

    current_stock: Mapped[int] = mapped_column(Integer)
    suggested_qty: Mapped[int] = mapped_column(Integer)
    urgency: Mapped[Urgency] = mapped_column(SAEnum(Urgency, name="suggestion_urgency"))
    confidence: Mapped[Confidence] = mapped_column(SAEnum(Confidence, name="suggestion_confidence"))
    reason: Mapped[str] = mapped_column(Text)
    method: Mapped[str] = mapped_column(String(40))

    status: Mapped[SuggestionStatus] = mapped_column(
        SAEnum(SuggestionStatus, name="suggestion_status"),
        default=SuggestionStatus.PENDING, index=True,
    )
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    product = relationship("Product")