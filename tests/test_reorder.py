# tests/test_reorder.py
from datetime import date, timedelta
from app.services.forecasting import Forecast, forecast_demand
from app.services.reorder import decide_reorder, confidence_level

def flat_forecast(avg=6.0, std=2.0, history=60, n=21):
    return Forecast([avg] * n, avg, std, history, "test")

def test_worked_example():
    r = decide_reorder(stock=20, fc=flat_forecast(), lead_time_days=7, min_level=10)
    assert r.reorder_point == 51        # 42 + 1.65*2*sqrt(7) = 50.7
    assert r.urgency == "critical"      # 3.3 days of stock < 7 days lead time
    assert r.suggested_qty == 73        # 6*14 + 8.7 - 20 = 72.7

def test_plenty_of_stock_gives_no_order():
    r = decide_reorder(stock=500, fc=flat_forecast(), lead_time_days=7, min_level=10)
    assert r.urgency == "ok" and r.suggested_qty == 0

def test_managers_minimum_level_is_respected():
    fc = flat_forecast(avg=0.5, std=0.1)
    r = decide_reorder(stock=30, fc=fc, lead_time_days=7, min_level=100)
    assert r.reorder_point >= 100 and r.urgency == "soon"

def test_zero_stock_is_always_critical():
    assert decide_reorder(0, flat_forecast(), 7, 10).urgency == "critical"

def test_no_history_does_not_crash():
    fc = forecast_demand([], start=date.today(), horizon=14)
    assert fc.avg_daily == 0 and fc.method == "no_data"
    assert decide_reorder(5, fc, 7, 10).suggested_qty == 0

def test_stockout_days_are_excluded_from_demand():
    today = date.today()
    days = [today - timedelta(i) for i in range(20, 0, -1)]
    with_gaps = [(d, None if i % 2 else 10) for i, d in enumerate(days)]
    fc = forecast_demand(with_gaps, today, 7)
    assert abs(fc.avg_daily - 10) < 0.01   # not dragged down to 5

def test_low_confidence_with_little_history():
    assert confidence_level(history_days=7, avg=5, std=1) == "low"
    assert confidence_level(history_days=90, avg=5, std=1) == "high"