"""
Append-only ledger: one row per change to Inventory.quantity.
Rows are never updated or deleted, so there is no updated_at column.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Numeric,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class MovementType(str, enum.Enum):
    IN = "IN"                  # stock added (purchase, return, initial stock)
    OUT = "OUT"                # stock removed (sale, damage, loss)
    ADJUSTMENT = "ADJUSTMENT"  # manual correction after a stock count


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Which stock row changed. product_id and branch_id are copied from the
    # inventory row so reports do not need a join.
    inventory_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("inventory.id"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"))
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id"))

    movement_type: Mapped[MovementType] = mapped_column(
        SAEnum(MovementType, name="movement_type")
    )
    quantity_change: Mapped[int] = mapped_column(Integer)   # +5 or -3
    quantity_before: Mapped[int] = mapped_column(Integer)
    quantity_after: Mapped[int] = mapped_column(Integer)

    reason: Mapped[str] = mapped_column(String(50))         # initial_stock, sale, damage, purchase...
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    inventory = relationship("Inventory")
    product = relationship("Product")
    branch = relationship("BranchModel")
    user = relationship("UserModel")
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    __table_args__ = (
        CheckConstraint("quantity_change <> 0", name="ck_stock_movement_nonzero"),
        CheckConstraint("quantity_after >= 0", name="ck_stock_movement_not_negative"),
        CheckConstraint(
            "quantity_after = quantity_before + quantity_change",
            name="ck_stock_movement_math",
        ),
        # History of one product in one branch, newest first
        Index("ix_stock_movements_product_branch_date", "product_id", "branch_id", "created_at"),
        Index("ix_stock_movements_reason", "reason"),
    )