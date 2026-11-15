import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ActivityLogModel(Base):
    __tablename__ = "activity_logs"

    # BigInteger, not UUID: sortable, so keyset pagination is simple and fast
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # WHO (SET NULL so logs survive if a user is ever hard-deleted)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_name: Mapped[Optional[str]] = mapped_column(String(50))   # snapshot
    actor_role: Mapped[Optional[str]] = mapped_column(String(20))   # snapshot

    # WHERE (for branch-scoped visibility)
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True
    )

    # WHAT
    action: Mapped[str] = mapped_column(String(100), nullable=False)       # "order.created"
    entity_type: Mapped[Optional[str]] = mapped_column(String(50))         # "order"
    entity_id: Mapped[Optional[str]] = mapped_column(String(64))           # str: works for any id type
    description: Mapped[Optional[str]] = mapped_column(Text)

    # DYNAMIC DETAILS
    changes: Mapped[Optional[dict]] = mapped_column(JSONB)  # {"status": {"old": "ACTIVE", "new": "SUSPENDED"}}
    meta: Mapped[Optional[dict]] = mapped_column(JSONB)

    # REQUEST CONTEXT
    ip_address: Mapped[Optional[str]] = mapped_column(INET)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255))

    __table_args__ = (
        Index("ix_activity_entity", "entity_type", "entity_id", "created_at"),
        Index("ix_activity_actor", "actor_id", "created_at"),
        Index("ix_activity_branch", "branch_id", "created_at"),
        Index("ix_activity_action", "action", "created_at"),
    )