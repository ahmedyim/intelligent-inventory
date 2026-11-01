import ipaddress
import uuid
from enum import Enum
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity_logs import ActivityLogModel
from app.models.users import UserModel
from datetime import date, datetime
from decimal import Decimal


def jsonable(value):
    """Make a value safe for a JSONB column (recursive)."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return str(value)            # exact, e.g. "800.00"
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    return str(value)                # never crash a request over a log row


def diff(obj, new_data: dict, skip: tuple[str, ...] = ()) -> dict:
    """{'field': {'old': ..., 'new': ...}} for fields that really change."""
    out = {}
    for key, new in new_data.items():
        if key in skip:
            continue
        old = getattr(obj, key, None)
        if old != new:
            out[key] = {"old": jsonable(old), "new": jsonable(new)}
    return out


def _clean_ip(ip: Optional[str]) -> Optional[str]:
    """INET column rejects invalid values, so validate first."""
    if not ip:
        return None
    try:
        return str(ipaddress.ip_address(ip))
    except ValueError:
        return None


def add_activity(
    db: AsyncSession,
    *,
    action: str,
    actor: Optional[UserModel] = None,
    actor_id: Optional[uuid.UUID] = None,
    branch_id: Optional[uuid.UUID] = None,
    entity_type: Optional[str] = None,
    entity_id=None,
    description: Optional[str] = None,
    changes: Optional[dict] = None,
    meta: Optional[dict] = None,
    device: Optional[dict] = None,
) -> None:
    """Add one activity-log row to the session. The CALLER commits."""
    device = device or {}
    db.add(
        ActivityLogModel(
            actor_id=actor.id if actor else actor_id,
            actor_name=getattr(actor, "full_name", None),
            actor_role=jsonable(actor.role) if actor and getattr(actor, "role", None) else None,
            branch_id=branch_id if branch_id is not None else getattr(actor, "branch_id", None),
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else None,
            description=description,
            changes=changes,
            meta=meta,
            ip_address=_clean_ip(device.get("ip_address")),
            user_agent=(device.get("user_agent") or "")[:255] or None,
        )
    )