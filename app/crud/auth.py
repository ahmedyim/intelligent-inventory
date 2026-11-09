"""
login            -> checks password -> issues access + refresh token (refresh row = one device)
refresh          -> checks refresh token -> REVOKES it -> issues a brand-new pair (rotation),
                    the new row keeps the same device name
logout           -> revokes the given refresh token (this device)
logout all       -> revokes every refresh token of the user
sessions         -> list active devices / revoke one device
forgot password  -> creates a one-time token, e-mails a link (always answers "ok")
reset password   -> checks the one-time token -> sets new password -> logs out everywhere

Every security-relevant action also writes an activity-log row in the SAME transaction.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import BadRequestError, ForbiddenError, UnauthorizedError
from app.core.security import hash_password
from app.core.tokens import (
    REFRESH, create_access_token, create_refresh_token, decode_token,
)
from app.crud.activity_logs import add_activity
from app.crud.session_utils import revoke_all_for_user
from app.crud.users import authenticate_user, get_user_by_email, get_user_by_id
from app.models.auth_tokens import PasswordResetTokenModel, RefreshTokenModel
from app.models.users import UserModel, UserStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    """databases return naive datetimes; treat them as UTC so comparisons work."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _hash_token(raw: str) -> str:
    """One-way hash for reset tokens. SHA-256 is fine because the token is long and random."""
    return hashlib.sha256(raw.encode()).hexdigest()


def _user_payload(user: UserModel) -> dict:
    """The user object returned by BOTH /auth/login and /auth/refresh.
    The frontend keeps the session in memory only, so after a page reload this
    is the only place it can learn who is signed in."""
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": getattr(user.role, "value", user.role),
        "branch_id": str(user.branch_id) if user.branch_id else None,
        "status": getattr(user.status, "value", user.status),
    }


async def _issue_token_pair(
    db: AsyncSession, user: UserModel, device: Optional[dict] = None
) -> tuple[dict, uuid.UUID]:
    """
    Create access + refresh token and save the refresh token (= one device session).
    Returns (token_pair, session_id). The CALLER commits.
    """
    device = device or {}
    refresh, jti, expires_at = create_refresh_token(user.id)       # refresh first: we need its jti
    access = create_access_token(user.id, user.role, session_id=jti)
    db.add(
        RefreshTokenModel(
            id=jti,
            user_id=user.id,
            expires_at=expires_at,
            last_used_at=_now(),
            device_name=device.get("device_name"),
            user_agent=device.get("user_agent"),
            ip_address=device.get("ip_address"),
        )
    )
    pair = {
        "access_token": access,
        "refresh_token": refresh,      # the route moves this into the httpOnly cookie
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": _user_payload(user),
    }
    return pair, jti


# ---------------------------------------------------------------------------
# Login / refresh / logout
# ---------------------------------------------------------------------------

async def login(
    db: AsyncSession, email: str, password: str, device: Optional[dict] = None
) -> dict:
    """Verify credentials (reuses authenticate_user) and return a token pair."""
    try:
        user = await authenticate_user(db, email, password)  # raises 401 / 403 on failure
    except (UnauthorizedError, ForbiddenError) as exc:
        # Nothing else is pending in the session, so commit the log, then re-raise.
        # Never log the password, only the email that was tried.
        add_activity(
            db,
            action="auth.login_failed",
            description="Failed login attempt",
            meta={"email": email, "reason": getattr(exc, "code", None) or str(exc)},
            device=device,
        )
        await db.commit()
        raise

    pair, session_id = await _issue_token_pair(db, user, device)
    add_activity(
        db,
        action="auth.login",
        actor=user,
        entity_type="user",
        entity_id=user.id,
        description="User logged in",
        meta={
            "session_id": str(session_id),
            "device_name": (device or {}).get("device_name"),
        },
        device=device,
    )
    await db.commit()
    return pair


async def check_refresh_token(db: AsyncSession, refresh_token: str) -> RefreshTokenModel:
    """
    Validate a refresh token and return its database row.
    Checks, in order:
      1. signature, expiry, and type == "refresh"        (JWT level)
      2. the row exists in our table                     (we really issued it)
      3. it was not revoked                              (logout / already used)
      4. the stored expiry has not passed
    """
    payload = decode_token(refresh_token, REFRESH)
    try:
        jti = uuid.UUID(payload["jti"])
    except (KeyError, ValueError):
        raise UnauthorizedError("Invalid token", code="invalid_token")

    # with_for_update locks the row, so two parallel refresh calls cannot both succeed.
    stored = await db.get(RefreshTokenModel, jti, with_for_update=True)
    if not stored:
        raise UnauthorizedError("Invalid token", code="invalid_token")

    if stored.revoked:
        if stored.rotated_at is None:
            # Logged out, or signed out by an admin: a plain 401, NOT theft
            raise UnauthorizedError("Session was ended", code="token_revoked")

        # A token that was already ROTATED came back: it may have been stolen.
        # Safest reaction: kill every session of this user.
        await revoke_all_for_user(db, stored.user_id)
        # ...the rest of the existing block (add_activity, commit, raise) stays as it is
    if _as_utc(stored.expires_at) < _now():
        raise UnauthorizedError("Refresh token has expired", code="token_expired")

    return stored


async def refresh_access_token(
    db: AsyncSession, refresh_token: str, ip_address: Optional[str] = None
) -> dict:
    """
    Trade a valid refresh token for a NEW access token.
    We also rotate the refresh token: the old one is revoked and a new one is returned,
    so each refresh token can be used exactly once. The device info is carried over.
    The response includes the user, so the frontend can restore its session after a reload.
    Normal refreshes are NOT logged (they happen every few minutes).
    """
    stored = await check_refresh_token(db, refresh_token)

    user = await get_user_by_id(db, stored.user_id)
    if not user or user.status != UserStatus.ACTIVE:
        # User was deactivated or deleted after logging in: end all sessions.
        await revoke_all_for_user(db, stored.user_id)
        add_activity(
            db,
            action="auth.refresh_denied",
            actor_id=stored.user_id,
            description="Refresh denied: account not active; all sessions revoked",
            device={"ip_address": ip_address, "user_agent": stored.user_agent},
        )
        await db.commit()
        raise ForbiddenError("Account is not active", code="account_inactive")

    stored.revoked = True                      # old token can never be used again
    stored.rotated_at = _now()
    pair, _ = await _issue_token_pair(
        db,
        user,
        device={
            "device_name": stored.device_name,            # same device keeps its name
            "user_agent": stored.user_agent,
            "ip_address": ip_address or stored.ip_address,  # IP may change, update it
        },
    )
    await db.commit()
    return pair


async def logout(db: AsyncSession, refresh_token: str) -> None:
    """
    Revoke one refresh token (this device).
    Idempotent: bad / expired / already-revoked tokens are ignored. We do NOT call
    check_refresh_token here, because that would treat a repeated logout as token
    theft and log the user out of every device.
    """
    try:
        payload = decode_token(refresh_token, REFRESH)
        jti = uuid.UUID(payload["jti"])
    except (UnauthorizedError, KeyError, ValueError):
        return
    stored = await db.get(RefreshTokenModel, jti)
    if stored and not stored.revoked:
        stored.revoked = True
        add_activity(
            db,
            action="auth.logout",
            actor_id=stored.user_id,
            entity_type="session",
            entity_id=stored.id,
            description="User logged out",
            device={"user_agent": stored.user_agent, "ip_address": stored.ip_address},
        )
        await db.commit()


async def logout_all(
    db: AsyncSession, user_id: uuid.UUID, device: Optional[dict] = None
) -> None:
    """Revoke every refresh token of a user (all devices)."""
    await revoke_all_for_user(db, user_id)
    add_activity(
        db,
        action="auth.logout_all",
        actor_id=user_id,
        entity_type="user",
        entity_id=user_id,
        description="User logged out of all devices",
        device=device,
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Sessions (devices)
# ---------------------------------------------------------------------------

async def list_sessions(db: AsyncSession, user_id: uuid.UUID) -> list[RefreshTokenModel]:
    """Active devices of a user, most recently used first."""
    stmt = (
        select(RefreshTokenModel)
        .where(
            RefreshTokenModel.user_id == user_id,
            RefreshTokenModel.revoked.is_(False),
            RefreshTokenModel.expires_at > _now(),
        )
        .order_by(RefreshTokenModel.last_used_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def revoke_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    device: Optional[dict] = None,
) -> None:
    """Log out ONE device. The user_id check stops users from revoking other people's sessions."""
    stored = await db.get(RefreshTokenModel, session_id)
    if not stored or stored.user_id != user_id:
        raise BadRequestError("Session not found", code="session_not_found")
    stored.revoked = True
    add_activity(
        db,
        action="auth.session_revoked",
        actor_id=user_id,
        entity_type="session",
        entity_id=session_id,
        description="User revoked a device session",
        meta={"device_name": stored.device_name},
        device=device,
    )
    await db.commit()


async def delete_expired_tokens(db: AsyncSession) -> int:
    """
    Housekeeping: rotation creates a new row on every refresh, so the table grows.
    Run this from a scheduled job (cron, APScheduler, Celery beat...). Returns rows deleted.
    """
    result = await db.execute(
        delete(RefreshTokenModel).where(RefreshTokenModel.expires_at < _now())
    )
    await db.execute(
        delete(PasswordResetTokenModel).where(PasswordResetTokenModel.expires_at < _now())
    )
    await db.commit()
    return result.rowcount or 0


# ---------------------------------------------------------------------------
# Forgot / reset password
# ---------------------------------------------------------------------------

async def create_password_reset(
    db: AsyncSession, email: str, device: Optional[dict] = None
) -> Optional[tuple[UserModel, str]]:
    """
    Step 1 of "forgot password".
    Returns (user, raw_token) so the router can e-mail the link, or None if the
    email is unknown/inactive. The router must give the SAME response either way,
    otherwise attackers can discover which emails are registered.
    """
    user = await get_user_by_email(db, email)
    if not user or user.status != UserStatus.ACTIVE:
        return None

    # Only the newest link should work: invalidate older unused ones.
    await db.execute(
        update(PasswordResetTokenModel)
        .where(PasswordResetTokenModel.user_id == user.id, PasswordResetTokenModel.used.is_(False))
        .values(used=True)
    )

    raw_token = secrets.token_urlsafe(32)  # cryptographically secure random string
    db.add(
        PasswordResetTokenModel(
            user_id=user.id,
            token_hash=_hash_token(raw_token),  # store only the hash
            expires_at=_now() + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
        )
    )
    add_activity(
        db,
        action="auth.password_reset_requested",
        actor=user,
        entity_type="user",
        entity_id=user.id,
        description="Password reset link requested",   # never log the token
        device=device,
    )
    await db.commit()
    return user, raw_token


async def reset_password_with_token(
    db: AsyncSession, raw_token: str, new_password: str, device: Optional[dict] = None
) -> None:
    """
    Step 2 of "forgot password": the user opened the e-mail link and chose a new password.
    (Named differently from users.reset_password, which is the ADMIN reset.)
    """
    invalid = BadRequestError("Invalid or expired reset token", code="invalid_reset_token")

    stmt = (
        select(PasswordResetTokenModel)
        .where(PasswordResetTokenModel.token_hash == _hash_token(raw_token))
        .with_for_update()
    )
    record = (await db.execute(stmt)).scalar_one_or_none()

    # Same error for unknown / used / expired so nothing leaks.
    if not record or record.used or _as_utc(record.expires_at) < _now():
        raise invalid

    user = await get_user_by_id(db, record.user_id)
    if not user or user.status != UserStatus.ACTIVE:
        raise invalid

    user.hashed_password = hash_password(new_password)
    record.used = True                          # one-time use
    await revoke_all_for_user(db, user.id)      # a password reset logs the user out everywhere
    add_activity(
        db,
        action="auth.password_reset_completed",
        actor=user,
        entity_type="user",
        entity_id=user.id,
        description="Password reset via e-mail link; all sessions revoked",
        device=device,
    )
    await db.commit()