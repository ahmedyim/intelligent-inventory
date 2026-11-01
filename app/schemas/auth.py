import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _normalize_email(v: Optional[str]) -> Optional[str]:
    return v.strip().lower() if v else v


class LoginRequest(BaseModel):
    email: str
    password: str
    device_name: Optional[str] = Field(default=None, max_length=100)  # e.g. "Ahmed's iPhone"
    _norm = field_validator("email", mode="after")(_normalize_email)


class TokenResponse(BaseModel):
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