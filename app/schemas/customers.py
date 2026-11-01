from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    credit_limit: Decimal = Field(default=Decimal("0"), ge=0)


class CustomerUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    credit_limit: Decimal | None = Field(default=None, ge=0)
    is_active: bool | None = None


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    phone: str | None
    credit_limit: Decimal
    is_active: bool
    created_at: datetime


class CustomerWithBalance(CustomerRead):
    outstanding: Decimal          # total they owe now
    available_credit: Decimal     # credit_limit - outstanding


class CustomerList(BaseModel):
    items: list[CustomerRead]
    total: int
    skip: int
    limit: int