from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BranchBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, examples=["Main branch"])
    location: Optional[str] = Field(None, max_length=50, examples=["bethel"])
    email: Optional[str] = Field(None, max_length=50, examples=["main@gmail.com"])
    phone: Optional[str] = Field(None, max_length=14, examples=["0900000000"])


class BranchCreate(BranchBase):
    pass


class BranchUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(None, min_length=1, max_length=50)
    location: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=50)
    phone: Optional[str] = Field(None, max_length=14)


class BranchResponse(BranchBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class BranchListResponse(BaseModel):
    items: list[BranchResponse]
    total: int