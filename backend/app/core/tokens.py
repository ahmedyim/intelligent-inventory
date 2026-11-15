"""
Two kinds of token:
  * ACCESS token  - short life (15 min), sent on every request, proves who you are.
                    Carries "sid" = the session (device) it belongs to.
  * REFRESH token - long life (7 days), used ONLY to get a new access token.
                    Carries "jti" = unique id, saved in the DB so it can be revoked.
Each carries a "type" claim, and each type is signed with its own secret key,
so one can never be used in place of the other.
"""
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings
from app.core.exceptions import UnauthorizedError

ACCESS = "access"
REFRESH = "refresh"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _secret_for(token_type: str) -> str:
    """Pick the signing key that belongs to this token type."""
    if token_type == ACCESS:
        return settings.ACCESS_TOKEN_SECRET_KEY
    if token_type == REFRESH:
        return settings.REFRESH_TOKEN_SECRET_KEY
    raise ValueError(f"Unknown token type: {token_type}")


def create_access_token(user_id: uuid.UUID, role, session_id: uuid.UUID) -> str:
    """Build a signed access token. 'sid' links it to one refresh-token row (one device)."""
    now = _now()
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "role": getattr(role, "value", role),
        "type": ACCESS,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, _secret_for(ACCESS), algorithm=settings.ALGORITHM)


def create_refresh_token(user_id: uuid.UUID) -> tuple[str, uuid.UUID, datetime]:
    """Returns (token, jti, expires_at). The jti is saved in the database."""
    now = _now()
    jti = uuid.uuid4()
    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAY)
    payload = {
        "sub": str(user_id),
        "jti": str(jti),
        "type": REFRESH,
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(payload, _secret_for(REFRESH), algorithm=settings.ALGORITHM)
    return token, jti, expires_at


def decode_token(token: str, expected_type: str) -> dict:
    """
    Verify signature + expiry with the key of the expected type, then check the
    "type" claim. algorithms=[...] is always passed explicitly.
    """
    try:
        payload = jwt.decode(
            token,
            _secret_for(expected_type),
            algorithms=[settings.ALGORITHM],
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.ExpiredSignatureError:
        raise UnauthorizedError("Token has expired", code="token_expired")
    except jwt.InvalidTokenError:
        raise UnauthorizedError("Invalid token", code="invalid_token")

    if payload.get("type") != expected_type:
        raise UnauthorizedError("Wrong token type", code="invalid_token_type")
    return payload