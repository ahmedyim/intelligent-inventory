from sqlalchemy import String,Text,DateTime,Uuid
from sqlalchemy.orm import Mapped,mapped_column,relationship
from typing import List,Optional
from datetime import datetime
import uuid
from app.core.db import Base

class BranchModel(Base):
    __tablename__="branches"
    id:Mapped[uuid.UUID]=mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
        nullable=False
    )
    name:Mapped[str]=mapped_column(String(50),nullable=False)
    location:Mapped[Optional[str]]=mapped_column(
        String(50),nullable=True
    )
    email:Mapped[Optional[str]]=mapped_column(String(50),nullable=True)
    phone:Mapped[Optional[str]]=mapped_column(String(14),nullable=True)    
    created_at:Mapped[datetime]=mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    updated_at:Mapped[datetime]=mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )
    users:Mapped[List["UserModel"]]=relationship(back_populates="branch",lazy="raise")
    inventory: Mapped[List["Inventory"]] = relationship(back_populates="branch", lazy="raise")
    