from sqlalchemy.ext.asyncio import AsyncSession,async_sessionmaker,create_async_engine
from sqlalchemy.orm import DeclarativeBase
from collections.abc import AsyncIterator
from app.core.config import settings
# create engine

engine=create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=False
)

AsyncSessionLocal=  async_sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
    class_=AsyncSession
)
class Base(DeclarativeBase):
    pass
async def get_db()->AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session