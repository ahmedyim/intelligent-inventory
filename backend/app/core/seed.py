import asyncio
import uuid
from sqlalchemy import select
from app.core.db import AsyncSessionLocal,engine
from app.models.users import UserModel
from app.core.security import hash_password
from app.core.config import settings

SUPER_ADMIN_EMAIL=settings.SUPER_ADMIN_EMAIL
SUPER_ADMIN_PASSWORD=settings.SUPER_ADMIN_PASSWORD
SUPER_ADMIN_FULL_NAME=settings.SUPER_ADMIN_FULL_NAME
SUPER_ADMIN_PHONE=settings.SUPER_ADMIN_PHONE

async def seed_super_admin()->None:
    async with AsyncSessionLocal() as session:
        exist=await session.scalar(
            select(UserModel).where(UserModel.email==SUPER_ADMIN_EMAIL)
        )
        if exist:
            print("super admin already exist")
            return
        session.add(UserModel(
            full_name=SUPER_ADMIN_FULL_NAME,
            email=SUPER_ADMIN_EMAIL,
            phone=SUPER_ADMIN_PHONE,
            role="SUPER_ADMIN",
            hashed_password=hash_password(SUPER_ADMIN_PASSWORD)
        ))
        await session.commit()
        print(f"super admin created: {SUPER_ADMIN_EMAIL}")
        
async def main()->None:
    try:
        # Code
        await seed_super_admin()
    except Exception as e:
        # Handle exception
        await engine.dispose()
if __name__=="__main__":
    asyncio.run(main())