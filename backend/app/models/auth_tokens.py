"""
Two tables:
  refresh_tokens         - every refresh token we issued (one row = one device session)
  password_reset_tokens  - one-time "forgot password" tokens (stored HASHED)
Remember to import this file in app/models/__init__.py, then run an Alembic migration.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RefreshTokenModel(Base):
    __tablename__ = "refresh_tokens"

    # id == the "jti" claim inside the JWT, so token <-> row is a 1-to-1 match.
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    # CASCADE: if a user is hard-deleted, their tokens disappear too.
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    rotated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    # Device / session info (shown in the "Active sessions" screen)
    device_name: Mapped[str | None] = mapped_column(String(100), nullable=True)   # "Safari on iOS"
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)    # raw header
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)     # fits IPv6
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PasswordResetTokenModel(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # SHA-256 of the raw token. If the DB leaks, attackers still can't reset passwords.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # single use
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)