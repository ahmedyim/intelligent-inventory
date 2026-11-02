import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.crud import branches as branches_crud
from app.models.forecast import (
    Confidence,
    ReorderSuggestion,
    SuggestionStatus,
    Urgency,
)
from app.models.products import Product
from app.models.users import UserModel
from app.schemas.forecast import ForecastRead, RunResult
from app.services import forecast_service as service


# ---------------- helpers ----------------
async def recently_approved_product_ids(
    db: AsyncSession, branch_id, days: int = 14
) -> set[uuid.UUID]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    res = await db.execute(
        select(ReorderSuggestion.product_id).where(
            ReorderSuggestion.branch_id == branch_id,
            ReorderSuggestion.status == SuggestionStatus.APPROVED,
            ReorderSuggestion.decided_at >= since,
        )
    )
    return set(res.scalars().all())


async def replace_pending(db: AsyncSession, branch_id, items: list[dict]) -> int:
    """Swap old PENDING suggestions for fresh ones. APPROVED/DISMISSED rows stay as history."""
    await db.execute(
        delete(ReorderSuggestion).where(
            ReorderSuggestion.branch_id == branch_id,
            ReorderSuggestion.status == SuggestionStatus.PENDING,
        )
    )
    db.add_all([
        ReorderSuggestion(
            product_id=i["product_id"],
            branch_id=i["branch_id"],
            supplier_id=i["supplier_id"],
            current_stock=i["current_stock"],
            suggested_qty=i["suggested_qty"],
            urgency=Urgency(i["urgency"].upper()),
            confidence=Confidence(i["confidence"].upper()),
            reason=i["reason"],
            method=i["method"],
        )
        for i in items
    ])
    await db.commit()               # delete + insert in one transaction
    return len(items)


# ---------------- actions ----------------
async def run_for_branch(
    db: AsyncSession, branch_id, *, actor: UserModel, device: dict
) -> RunResult:
    if not await branches_crud.get_branch_by_id(db, branch_id):
        raise NotFoundError("Branch not found", code="branch_not_found")

    already_ordered = await recently_approved_product_ids(db, branch_id)
    items = await service.generate_suggestions(
        db, branch_id, exclude_product_ids=already_ordered
    )
    created = await replace_pending(db, branch_id, items)
    # audit log: pass actor/device to your audit helper here
    return RunResult(branch_id=branch_id, created=created)


async def decide(
    db: AsyncSession,
    suggestion_id,
    new_status: SuggestionStatus,
    note: Optional[str],
    *,
    actor: UserModel,
    device: dict,
) -> ReorderSuggestion:
    s = await get_suggestion_or_404(db, suggestion_id)
    if s.status != SuggestionStatus.PENDING:
        raise ConflictError(
            "Suggestion was already decided", code="suggestion_already_decided"
        )
    s.status = new_status
    s.decided_by = actor.id
    s.decided_at = datetime.now(timezone.utc)
    s.decision_note = note
    await db.commit()
    # audit log: pass actor/device to your audit helper here
    return s


# ---------------- reads ----------------
async def list_suggestions(
    db: AsyncSession,
    *,
    branch_id,
    status_: Optional[SuggestionStatus],
    urgency: Optional[Urgency],
    skip: int,
    limit: int,
):
    conds = [ReorderSuggestion.branch_id == branch_id]
    if status_:
        conds.append(ReorderSuggestion.status == status_)
    if urgency:
        conds.append(ReorderSuggestion.urgency == urgency)

    total = (await db.execute(
        select(func.count()).select_from(ReorderSuggestion).where(*conds)
    )).scalar_one()
    rows = (await db.execute(
        select(ReorderSuggestion)
        .options(selectinload(ReorderSuggestion.product))
        .where(*conds)
        .order_by(ReorderSuggestion.urgency, ReorderSuggestion.generated_at.desc())
        .offset(skip)
        .limit(limit)
    )).scalars().all()
    return rows, total


async def get_suggestion_or_404(db: AsyncSession, suggestion_id) -> ReorderSuggestion:
    s = (await db.execute(
        select(ReorderSuggestion)
        .options(selectinload(ReorderSuggestion.product))
        .where(ReorderSuggestion.id == suggestion_id)
    )).scalar_one_or_none()
    if s is None:
        raise NotFoundError("Suggestion not found", code="suggestion_not_found")
    return s


async def product_forecast(
    db: AsyncSession, product_id, branch_id, horizon: int
) -> ForecastRead:
    if await db.get(Product, product_id) is None:
        raise NotFoundError("Product not found", code="product_not_found")
    if not await branches_crud.get_branch_by_id(db, branch_id):
        raise NotFoundError("Branch not found", code="branch_not_found")

    fc = await service.forecast_for_product(db, product_id, branch_id, horizon=horizon)
    return ForecastRead(
        product_id=product_id,
        branch_id=branch_id,
        method=fc.method,
        history_days=fc.history_days,
        avg_daily=round(fc.avg_daily, 2),
        std_daily=round(fc.std_daily, 2),
        horizon_days=horizon,
        daily=[round(x, 2) for x in fc.daily],
        total_units=round(sum(fc.daily), 1),
    )