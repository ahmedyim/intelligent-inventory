import enum
import uuid
from datetime import date, datetime
from typing import Any, Optional

from fastapi import Request
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_logs import ActivityLogModel
from app.models.users import UserModel

SENSITIVE_FIELDS = {"hashed_password", "password", "token"}


def _jsonable(v: Any):
    if isinstance(v, (uuid.UUID,)):
        return str(v)
    if isinstance(v, enum.Enum):
        return v.value
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def snapshot(obj, fields: Optional[set[str]] = None) -> dict:
    """Column values of a model as JSON-safe dict, minus secrets."""
    cols = {c.key for c in sa_inspect(obj).mapper.column_attrs}
    cols -= SENSITIVE_FIELDS
    if fields:
        cols &= fields
    return {c: _jsonable(getattr(obj, c)) for c in cols}


def diff(old: dict, new: dict) -> dict:
    return {
        k: {"old": old.get(k), "new": new[k]}
        for k in new
        if old.get(k) != new[k]
    }


def log_activity(
    db: AsyncSession,
    *,
    action: str,
    actor: Optional[UserModel] = None,
    entity_type: Optional[str] = None,
    entity_id: Any = None,
    branch_id: Optional[uuid.UUID] = None,
    description: Optional[str] = None,
    changes: Optional[dict] = None,
    meta: Optional[dict] = None,
    request: Optional[Request] = None,
) -> None:
    db.add(ActivityLogModel(
        action=action,
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else None,
        actor_role=actor.role.value if actor else None,
        branch_id=branch_id or (actor.branch_id if actor else None),
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        description=description,
        changes=changes or None,
        meta=meta,
        ip_address=request.client.host if request and request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:255] if request else None,
    ))
    # no commit: it goes in the same transaction as the real change