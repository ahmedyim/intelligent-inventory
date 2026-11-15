from enum import Enum
import datetime as dt
import uuid

from pydantic import BaseModel


class ReportPeriod(str, Enum):
    today = "today"
    week = "week"
    month = "month"


class PeriodTotals(BaseModel):
    sales_count: int
    revenue: float
    cost: float
    profit: float


class SummaryReport(PeriodTotals):
    previous: PeriodTotals
    total_products: int
    inventory_value: float
    low_stock: int
    out_of_stock: int

class TrendGranularity(str, Enum):
    day = "day"
    week = "week"
    month = "month"


class TrendPoint(BaseModel):
    date: dt.date         
    revenue: float
    cost: float
    profit: float


class SalesTrend(BaseModel):
    granularity: TrendGranularity
    points: list[TrendPoint]


class BranchRevenue(BaseModel):
    branch_id: uuid.UUID
    branch_name: str
    revenue: float
    sales_count: int