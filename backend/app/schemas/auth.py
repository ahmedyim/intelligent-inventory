import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator
from app.schemas.users import UserRole


def _normalize_email(v: Optional[str]) -> Optional[str]:
    return v.strip().lower() if v else v


class LoginRequest(BaseModel):
    email: str
    password: str
    device_name: Optional[str] = Field(default=None, max_length=100)  # e.g. "Ahmed's iPhone"
    _norm = field_validator("email", mode="after")(_normalize_email)


class UserSummaryOut(BaseModel):
    """The signed-in user, returned by BOTH /auth/login and /auth/refresh.
    The frontend keeps the session in memory only, so after a page reload this
    is the only place it learns who is signed in."""
    id: uuid.UUID
    email: EmailStr
    role: UserRole
    full_name: str
    branch_id: Optional[uuid.UUID] = None
    status: str   # "ACTIVE" | "INACTIVE" | "SUSPENDED"

    model_config = ConfigDict(from_attributes=True)


class TokenOut(BaseModel):
    """Login/refresh response. The refresh token is NOT here: it travels in the HttpOnly cookie."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserSummaryOut


class TokenResponse(BaseModel):
    """Old shape (refresh token in the body). Kept only so nothing else breaks."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: str
    _norm = field_validator("email", mode="after")(_normalize_email)


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_name: Optional[str] = None
    ip_address: Optional[str] = None
    last_used_at: Optional[datetime] = None
    created_at: datetime
    is_current: bool = False

    @field_validator("ip_address", mode="before")
    @classmethod
    def _ip_to_str(cls, v):
        return str(v) if v is not None else None


class MessageResponse(BaseModel):
    message: str