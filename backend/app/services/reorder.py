import math
from dataclasses import dataclass

Z_95 = 1.65
REVIEW_DAYS = 7     # how often you re-order, so you cover that gap too

@dataclass
class ReorderResult:
    reorder_point: int
    suggested_qty: int
    days_of_stock: float | None
    urgency: str        # "critical" | "soon" | "ok"
    confidence: str     # "low" | "medium" | "high"
    reason: str

def confidence_level(history_days, avg, std) -> str:
    cv = (std / avg) if avg > 0 else 9.0     # how erratic sales are
    if history_days < 14 or cv > 1.5:
        return "low"
    if history_days >= 60 and cv < 0.8:
        return "high"
    return "medium"


def decide_reorder(stock, fc, lead_time_days, min_level) -> ReorderResult:
    lead = max(1, lead_time_days)
    safety = Z_95 * fc.std_daily * math.sqrt(lead)
    lead_demand = sum(fc.daily[:lead])

    # never go below the manager's own minimum level
    reorder_point = max(lead_demand + safety, min_level)

    days_of_stock = stock / fc.avg_daily if fc.avg_daily > 0 else None

    if fc.avg_daily == 0:
        urgency = "critical" if stock <= 0 else "ok"
    elif stock <= 0 or (days_of_stock is not None and days_of_stock < lead):
        urgency = "critical"      # will run out before a new order arrives
    elif stock <= reorder_point:
        urgency = "soon"
    else:
        urgency = "ok"

    qty = 0
    if urgency != "ok":
        target = sum(fc.daily[:lead + REVIEW_DAYS]) + safety
        # FIX: never order up to less than the reorder point / manager's minimum
        target = max(target, math.ceil(reorder_point))
        qty = max(0, math.ceil(target - stock))

    conf = confidence_level(fc.history_days, fc.avg_daily, fc.std_daily)
    reason = (
        f"Selling about {fc.avg_daily:.1f}/day, "
        + (f"{days_of_stock:.1f} days of stock left, " if days_of_stock is not None else "")
        + f"supplier takes {lead} days. Based on {fc.history_days} days of sales."
    )
    return ReorderResult(math.ceil(reorder_point), qty, days_of_stock, urgency, conf, reason)