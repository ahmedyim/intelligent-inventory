import uuid
from datetime import datetime
from typing import Optional, Sequence

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SupplierCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    contact_person: Optional[str] = Field(default=None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=30)
    address: Optional[str] = Field(default=None, max_length=255)


class SupplierUpdate(BaseModel):
    """All fields optional. Only fields the client sends are updated."""
    name: Optional[str] = Field(default=None, min_length=2, max_length=150)
    contact_person: Optional[str] = Field(default=None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=30)
    address: Optional[str] = Field(default=None, max_length=255)


class SupplierStatusUpdate(BaseModel):
    is_active: bool


class SupplierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    contact_person: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SupplierList(BaseModel):
    items: Sequence[SupplierRead]
    total: int
    skip: int
    limit: int