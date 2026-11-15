import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.forecast import Confidence, SuggestionStatus, Urgency


class ProductBrief(BaseModel):
    """What a suggestion needs to show a product. Never any cost or price."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sku: str
    barcode: str | None = None
    name: str
    unit: str
    image_url: str | None = None


class SuggestionView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    branch_id: uuid.UUID
    supplier_id: uuid.UUID | None = None
    current_stock: int
    suggested_qty: int
    urgency: Urgency
    confidence: Confidence
    reason: str
    method: str
    status: SuggestionStatus
    generated_at: datetime
    decided_by: uuid.UUID | None = None
    decided_at: datetime | None = None
    decision_note: str | None = None
    product: ProductBrief | None = None


class SuggestionViewList(BaseModel):
    items: list[SuggestionView]
    total: int
    skip: int
    limit: int