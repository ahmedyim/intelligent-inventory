"""
FastAPI dependencies used by routers.
  get_current_user  -> reads "Authorization: Bearer <access token>", returns the user
  require_role(...) -> same, but also checks the user's role
  require_admin     -> shortcut for super admin + branch admin
"""
import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.tokens import ACCESS, decode_token
from app.crud.users import get_user_by_id
from app.models.users import UserModel, UserStatus
from app.schemas.users import UserRole

# auto_error=False so WE control the error format (your custom exceptions).
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> UserModel:
    if creds is None:
        raise UnauthorizedError("Not authenticated", code="not_authenticated")
    payload = decode_token(creds.credentials, ACCESS)  # refresh tokens are rejected here
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise UnauthorizedError("Invalid token", code="invalid_token")

    # Load the user every time so a deactivated account loses access immediately.
    user = await get_user_by_id(db, user_id)

    if not user:
        raise UnauthorizedError("User no longer exists", code="user_not_found")
    if user.status != UserStatus.ACTIVE:
        raise ForbiddenError("Account is not active", code="account_inactive")

    # Which device this access token belongs to (used by GET /sessions -> is_current).
    # Use the claim name that create_access_token writes ("sid", "session_id" or "jti").
    user.session_id = payload.get("sid")
    return user


def require_role(*allowed: UserRole):
    """Usage:  Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))"""
    async def checker(user: UserModel = Depends(get_current_user)) -> UserModel:
        print(user.role,"not allowed in",allowed)
        if user.role not in allowed:
            raise ForbiddenError("You do not have permission", code="forbidden")
        return user
    return checker

require_super_admin = require_role(UserRole.SUPER_ADMIN)
require_admin = require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)