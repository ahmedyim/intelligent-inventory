import enum
import uuid
from sqlalchemy import Enum as SQLEnum,Text,String,DateTime,Uuid,ForeignKey
from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped,mapped_column,relationship
from app.core.db import Base
from app.models.branches import BranchModel

#user role
class UserRole(str,enum.Enum):
    SUPER_ADMIN="SUPER_ADMIN"
    BRANCH_ADMIN="BRANCH_ADMIN"
    SELLER="SELLER"
    
class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"          # can log in and work normally
    INACTIVE = "INACTIVE"      # deactivated (left the job, soft delete)
    SUSPENDED = "SUSPENDED"    # temporarily blocked by an admin

#create user table
class UserModel(Base):
    __tablename__="users"
    id:Mapped[uuid.UUID]=mapped_column(Uuid(as_uuid=True),
                                       primary_key=True,
                                       default=uuid.uuid4,
                                       index=True,nullable=False)
    full_name:Mapped[str]=mapped_column(String(50),nullable=False)
    email:Mapped[str]=mapped_column(String(50),unique=True,index=True,nullable=False)
    phone:Mapped[Optional[str]]=mapped_column(String(14),nullable=True)
    role:Mapped[UserRole]=mapped_column(SQLEnum(UserRole),default=UserRole.SELLER,nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        SQLEnum(UserStatus),
        default=UserStatus.ACTIVE,
        index=True,
        nullable=False,
    )
    hashed_password:Mapped[str]=mapped_column(String(255),nullable=False)
    branch_id:Mapped[Optional[uuid.UUID]]=mapped_column(Uuid(as_uuid=True),ForeignKey("branches.id",ondelete="RESTRICT"),index=True)
    branch:Mapped["BranchModel"]=relationship(back_populates="users",lazy="raise")
    created_at:Mapped[datetime]=mapped_column(
        DateTime,default=datetime.utcnow,
        nullable=False
    )
    updated_at:Mapped[datetime]=mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )