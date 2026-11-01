import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.core.device import device_dep, get_client_ip, get_device_info
from app.core.dependencies import get_current_user
from app.crud import auth as auth_service
from app.schemas.auth import (
    ForgotPasswordRequest, LoginRequest, LogoutRequest, MessageResponse,
    RefreshRequest, ResetPasswordRequest, SessionOut, TokenResponse,
)

router = APIRouter(tags=["auth"])   # the prefix ("/auth") is set in main.py


def send_reset_email(email: str, raw_token: str) -> None:
    """Placeholder: plug in your e-mail sender here."""
    link = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
    print(f"[DEV] reset link for {email}: {link}")


@router.post("/login", response_model=TokenResponse)
async def login_route(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    device = get_device_info(request, data.device_name)
    return await auth_service.login(db, data.email, data.password, device)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_route(data: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
    return await auth_service.refresh_access_token(db, data.refresh_token, get_client_ip(request))


@router.post("/logout", response_model=MessageResponse)
async def logout_route(data: LogoutRequest, db: AsyncSession = Depends(get_db)):
    await auth_service.logout(db, data.refresh_token)   # IP/UA are taken from the stored row
    return MessageResponse(message="Logged out")


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all_route(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    device: dict = Depends(device_dep),
):
    await auth_service.logout_all(db, current_user.id, device)
    return MessageResponse(message="Logged out from all devices")


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
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    device: dict = Depends(device_dep),
):
    await auth_service.revoke_session(db, current_user.id, session_id, device)
    return MessageResponse(message="Session revoked")


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
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    device: dict = Depends(device_dep),
):
    await auth_service.reset_password_with_token(db, data.token, data.new_password, device)
    return MessageResponse(message="Password updated. Please log in again")