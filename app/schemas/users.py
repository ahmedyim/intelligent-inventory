from pydantic import BaseModel,EmailStr,Field,ConfigDict
from enum import Enum
from datetime import datetime
from typing import Optional
import uuid

#user role
class UserRole(str,Enum):
    SUPER_ADMIN="SUPER_ADMIN"
    BRANCH_ADMIN="BRANCH_ADMIN"
    SELLER="SELLER"
class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"          # can log in and work normally
    INACTIVE = "INACTIVE"      # deactivated (left the job, soft delete)
    SUSPENDED = "SUSPENDED"    # temporarily blocked by an admin

class UserBase(BaseModel):
    full_name:str=Field(...,min_length=3,max_length=50,example="Ahmed Umer")
    email:EmailStr=Field(...,example="ahmed@example.com")
    phone:Optional[str]=Field(None,example="093453267")
    role:UserRole=UserRole.SELLER
    experience:Optional[str]=Field(None,example="3 year in inventory")
    education_background:Optional[str]=Field(None,example="BSc in Computer Science")
    branch_id:Optional[uuid.UUID]=Field(None,example="3fa85f64-5717-4562-b3fc-2c963f66afa6")
    
#schema used when user creating a user
class UserCreate(UserBase):
    password:str=Field(...,min_length=4,max_length=8,example="SecurePassword@1234")


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=3, max_length=50, example="Ahmed Umer")
    email: Optional[EmailStr] = Field(None, example="ahmed@example.com")
    phone: Optional[str] = Field(None, example="093453267")
    role: Optional[UserRole] = Field(None, example=UserRole.SELLER)
    experience: Optional[str] = Field(None, example="4 years in inventory management")
    education_background: Optional[str] = Field(None, example="MSc in Information Systems")
    branch_id: Optional[uuid.UUID] = Field(None, example="3fa85f64-5717-4562-b3fc-2c963f66afa6")
    
    model_config = ConfigDict(from_attributes=True)
    
class UserResponse(BaseModel):
    """Never include hashed_password here."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str
    phone: Optional[str] = None
    role: UserRole
    status: UserStatus
    branch_id: Optional[uuid.UUID] = None
    created_at: datetime


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class StatusUpdate(BaseModel):
    status: UserStatus