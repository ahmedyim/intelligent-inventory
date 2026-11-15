import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Inventory(Base):
    __tablename__ = "inventory"
    __table_args__ = (
        UniqueConstraint("product_id", "branch_id", name="uq_inventory_product_branch"),
        CheckConstraint("quantity >= 0", name="ck_inventory_quantity_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), index=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"), index=True)

    quantity: Mapped[int] = mapped_column(Integer, default=0)
    # optional per-branch override; if None, use Product.reorder_level
    reorder_level: Mapped[int | None] = mapped_column(Integer, nullable=True)

    last_counted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    product = relationship("Product", back_populates="inventory")
    branch = relationship("BranchModel", back_populates="inventory")