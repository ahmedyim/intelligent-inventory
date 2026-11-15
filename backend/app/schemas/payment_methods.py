from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaymentMethodCreate(BaseModel):
    code: str = Field(pattern="^[a-z0-9_]{2,20}$")   # lowercase, e.g. "telebirr", "cbe_main"
    name: str = Field(min_length=1, max_length=80)
    type: str = Field(default="bank", pattern="^(cash|mobile_money|bank)$")
    account_number: str | None = Field(default=None, max_length=60)
    account_name: str | None = Field(default=None, max_length=120)
    requires_reference: bool = True
    sort_order: int = 0


class PaymentMethodUpdate(BaseModel):
    # code and type are never changed: old payments keep the code as a snapshot
    name: str | None = Field(default=None, min_length=1, max_length=80)
    account_number: str | None = Field(default=None, max_length=60)
    account_name: str | None = Field(default=None, max_length=120)
    requires_reference: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class PaymentMethodRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    name: str
    type: str
    account_number: str | None
    account_name: str | None
    requires_reference: bool
    is_active: bool
    sort_order: int
    created_at: datetime