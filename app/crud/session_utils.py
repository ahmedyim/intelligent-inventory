import uuid

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_tokens import RefreshTokenModel


async def revoke_all_for_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Mark every active refresh token of a user as revoked. The CALLER commits."""
    await db.execute(
        update(RefreshTokenModel)
        .where(RefreshTokenModel.user_id == user_id, RefreshTokenModel.revoked.is_(False))
        .values(revoked=True)
    )