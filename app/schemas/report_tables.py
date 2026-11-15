import datetime as dt
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel


class ReportKey(str, Enum):
    sales = "sales"
    by_staff = "by-staff"
    by_branch = "by-branch"
    by_product = "by-product"
    payments = "payments"
    receivables = "receivables"
    stock = "stock"


ColumnType = Literal["text", "money", "int", "percent", "date", "datetime"]


class ReportColumn(BaseModel):
    key: str
    label: str
    type: ColumnType = "text"


class ReportTable(BaseModel):
    key: ReportKey
    title: str
    uses_period: bool                    # False = a snapshot of "right now"
    columns: list[ReportColumn]
    rows: list[dict[str, Any]]
    totals: dict[str, Any] | None = None  # keyed by column key; percent is a fraction (0.25 = 25%)
    total: int                            # rows available (before paging)
    skip: int
    limit: int                            # rows per page actually applied
    truncated: bool = False               # an export hit the row cap
    filters: list[str]                    # human text: "Period: ...", "Branch: ..."
    methods: list[str] = []               # payment method codes, for the filter
    window_start: dt.date | None = None
    window_end: dt.date | None = None
    generated_at: dt.datetime