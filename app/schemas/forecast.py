import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.forecast import Confidence, SuggestionStatus, Urgency


class ProductBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    sku: str
    name: str
    unit: str


class SuggestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    product: ProductBrief
    branch_id: uuid.UUID
    supplier_id: Optional[uuid.UUID]
    current_stock: int
    suggested_qty: int
    urgency: Urgency
    confidence: Confidence
    reason: str
    method: str
    status: SuggestionStatus
    generated_at: datetime
    decided_at: Optional[datetime]
    decision_note: Optional[str]


class SuggestionList(BaseModel):
    items: list[SuggestionRead]
    total: int
    skip: int
    limit: int


class SuggestionDecision(BaseModel):
    note: Optional[str] = Field(None, max_length=500)


class RunRequest(BaseModel):
    branch_id: uuid.UUID


class RunResult(BaseModel):
    branch_id: uuid.UUID
    created: int


class ForecastRead(BaseModel):
    product_id: uuid.UUID
    branch_id: uuid.UUID
    method: str
    history_days: int
    avg_daily: float
    std_daily: float
    horizon_days: int
    daily: list[float]
    total_units: float