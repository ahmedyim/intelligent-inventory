import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, Header, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.device import device_dep, get_client_ip, get_device_info
from app.core.dependencies import get_current_user
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.crud import auth as auth_service
from app.schemas.auth import (
    ForgotPasswordRequest, LoginRequest, MessageResponse,
    ResetPasswordRequest, SessionOut, TokenOut,
)

router = APIRouter(tags=["auth"])   # the prefix ("/auth") is set in main.py


# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------
def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAY * 24 * 3600,
        path=settings.REFRESH_COOKIE_PATH,
        domain=settings.COOKIE_DOMAIN,
        secure=settings.COOKIE_SECURE,
        httponly=True,                      # JavaScript can never read it (XSS-safe)
        samesite=settings.COOKIE_SAMESITE,
    )


def _clear_refresh_cookie(response: Response) -> None:
    # must use the SAME path/domain as set_cookie, or the browser keeps the cookie
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        domain=settings.COOKIE_DOMAIN,
        secure=settings.COOKIE_SECURE,
        httponly=True,
        samesite=settings.COOKIE_SAMESITE,
    )


def _token_out(pair: dict, response: Response) -> TokenOut:
    """Move the refresh token into the cookie and return only the access token."""
    _set_refresh_cookie(response, pair.pop("refresh_token"))
    response.headers["Cache-Control"] = "no-store"
    return TokenOut(**pair)


def csrf_guard(
    request: Request,
    x_requested_with: Optional[str] = Header(default=None),
) -> None:
    """
    Production: the header X-Requested-With must be XMLHttpRequest, and the
    Origin must be our frontend or this API itself.
    Development: set CSRF_REQUIRED=false in .env and the check is skipped.
    """
    if not settings.CSRF_REQUIRED:
        return

    if x_requested_with != "XMLHttpRequest":
        raise ForbiddenError("Missing CSRF header", code="csrf_failed")

    origin = (request.headers.get("origin") or "").rstrip("/")
    if origin:
        own_origin = f"{request.url.scheme}://{request.headers.get('host', '')}"
        if origin not in settings.allowed_origins and origin != own_origin:
            raise ForbiddenError("Origin not allowed", code="csrf_failed")
def send_reset_email(email: str, raw_token: str) -> None:
    """Placeholder: plug in your e-mail sender here."""
    link = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
    print(f"[DEV] reset link for {email}: {link}")


# ---------------------------------------------------------------------------
# Login / refresh / logout
# ---------------------------------------------------------------------------
@router.post("/login", response_model=TokenOut, dependencies=[Depends(csrf_guard)])
async def login_route(
    data: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    device = get_device_info(request, data.device_name)
    pair = await auth_service.login(db, data.email, data.password, device)
    return _token_out(pair, response)


@router.post("/refresh", response_model=TokenOut, dependencies=[Depends(csrf_guard)])
async def refresh_route(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None, alias=settings.REFRESH_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
):
    """Cookie in -> new access token in the body and a ROTATED cookie out."""
    if not refresh_token:
        raise UnauthorizedError("Missing refresh token", code="missing_refresh_token")
    pair = await auth_service.refresh_access_token(db, refresh_token, get_client_ip(request))
    return _token_out(pair, response)


@router.post("/logout", response_model=MessageResponse, dependencies=[Depends(csrf_guard)])
async def logout_route(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None, alias=settings.REFRESH_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
):
    """Always succeeds: revoke this device's token if there is one, always clear the cookie."""
    if refresh_token:
        await auth_service.logout(db, refresh_token)   # idempotent, ignores bad tokens
    _clear_refresh_cookie(response)
    return MessageResponse(message="Logged out")


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all_route(
    response: Response,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    device: dict = Depends(device_dep),
):
    await auth_service.logout_all(db, current_user.id, device)
    _clear_refresh_cookie(response)
    return MessageResponse(message="Logged out from all devices")


# ---------------------------------------------------------------------------
# Sessions (devices)
# ---------------------------------------------------------------------------
@router.get("/sessions", response_model=list[SessionOut])
async def sessions_route(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = await auth_service.list_sessions(db, current_user.id)
    return [
        SessionOut(
            id=r.id,
            device_name=r.device_name,
            ip_address=r.ip_address,
            last_used_at=r.last_used_at,
            created_at=r.created_at,
            is_current=(str(r.id) == current_user.session_id),
        )
        for r in rows
    ]


@router.delete("/sessions/{session_id}", response_model=MessageResponse)
async def revoke_session_route(
    session_id: uuid.UUID,
    response: Response,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    device: dict = Depends(device_dep),
):
    await auth_service.revoke_session(db, current_user.id, session_id, device)
    if str(session_id) == current_user.session_id:    # user removed THIS device
        _clear_refresh_cookie(response)
    return MessageResponse(message="Session revoked")

# ---------------------------------------------------------------------------
# Forgot / reset password (no cookie involved)
# ---------------------------------------------------------------------------
@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password_route(
    data: ForgotPasswordRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    device: dict = Depends(device_dep),
):
    result = await auth_service.create_password_reset(db, data.email, device)
    if result:
        user, raw_token = result
        background.add_task(send_reset_email, user.email, raw_token)
    # SAME answer whether the email exists or not
    return MessageResponse(message="If that email is registered, a reset link has been sent")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password_route(
    response: Response,
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    device: dict = Depends(device_dep),
):
    await auth_service.reset_password_with_token(db, data.token, data.new_password, device)
    _clear_refresh_cookie(response)       # all sessions were revoked, drop this browser's cookie too
    return MessageResponse(message="Password updated. Please log in again")