"""
Public routes: no login. Thin HTTP wiring plus a simple per-IP rate limit.
"""
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.device import get_client_ip
from app.crud import public as crud
from app.schemas.public import PublicBranch, PublicCategory, PublicProductList, PublicStats

RATE_LIMIT = 120        # requests
RATE_WINDOW = 60.0      # per this many seconds, per IP

# Per process. With several workers, or in production, use Redis (for example slowapi + Redis).
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request) -> None:
    ip = get_client_ip(request) or "unknown"
    now = time.monotonic()
    cutoff = now - RATE_WINDOW

    if len(_hits) > 5000:   # forget idle visitors so the table cannot grow forever
        for key in [k for k, q in _hits.items() if not q or q[-1] < cutoff]:
            del _hits[key]

    q = _hits[ip]
    while q and q[0] < cutoff:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.", headers={"Retry-After": "60"})
    q.append(now)


router = APIRouter(prefix="", tags=["public"], dependencies=[Depends(rate_limit)])


def _cache_for(response: Response, seconds: int) -> None:
    response.headers["Cache-Control"] = f"public, max-age={seconds}"


@router.get("/stats", response_model=PublicStats)
async def public_stats(response: Response, db: AsyncSession = Depends(get_db)):
    _cache_for(response, 60)
    return await crud.cached_stats(db)


@router.get("/branches", response_model=list[PublicBranch])
async def public_branches(response: Response, db: AsyncSession = Depends(get_db)):
    _cache_for(response, 300)
    return await crud.cached_branches(db)


@router.get("/categories", response_model=list[PublicCategory])
async def public_categories(response: Response, db: AsyncSession = Depends(get_db)):
    _cache_for(response, 300)
    return await crud.cached_categories(db)


@router.get("/products", response_model=PublicProductList)
async def public_products(
    response: Response,
    search: Optional[str] = Query(None, max_length=60),
    category: Optional[str] = Query(None, max_length=80),
    in_stock_only: bool = False,
    skip: int = Query(0, ge=0, le=5000),
    limit: int = Query(12, ge=1, le=48),     # small pages: this endpoint has no login
    db: AsyncSession = Depends(get_db),
):
    _cache_for(response, 30)
    return await crud.list_products(
        db, search=search, category=category, in_stock_only=in_stock_only, skip=skip, limit=limit
    )