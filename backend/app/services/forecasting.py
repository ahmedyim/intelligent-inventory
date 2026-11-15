import statistics
from dataclasses import dataclass
from datetime import date, timedelta

@dataclass
class Forecast:
    daily: list[float]      # predicted units for each of the next N days
    avg_daily: float
    std_daily: float
    history_days: int       # usable days (stockout days excluded)
    method: str

def forecast_demand(series, start: date, horizon: int) -> Forecast:
    points = [(d, q) for d, q in series if q is not None]
    n = len(points)
    if n == 0:
        return Forecast([0.0] * horizon, 0.0, 0.0, 0, "no_data")

    qs = [q for _, q in points]
    last = points[-1][0]
    # half-life of 14 days: a sale 14 days ago counts half as much as today's
    weights = [0.5 ** ((last - d).days / 14) for d, _ in points]
    level = sum(w * q for w, (_, q) in zip(weights, points)) / sum(weights)

    factors = {wd: 1.0 for wd in range(7)}
    method = "weighted_average"
    overall = statistics.mean(qs)
    if n >= 28 and overall > 0:
        for wd in range(7):
            vals = [q for d, q in points if d.weekday() == wd]
            if vals:
                factors[wd] = statistics.mean(vals) / overall
        method = "weighted_average_weekday"

    daily = [max(0.0, level * factors[(start + timedelta(i)).weekday()])
             for i in range(horizon)]
    std = statistics.pstdev(qs) if n > 1 else 0.0
    return Forecast(daily, level, std, n, method)