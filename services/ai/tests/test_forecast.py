import numpy as np
from fastapi.testclient import TestClient

from app.forecast import forecast_demand
from app.main import app

client = TestClient(app)


def test_refuses_without_data():
    assert forecast_demand([]).reason == "NO_HISTORY"
    assert forecast_demand([0] * 30).reason == "NO_SALES"
    assert forecast_demand([1, 2, 3]).reason == "TOO_SHORT"


def test_stable_demand_has_no_seasonality_and_high_confidence():
    rng = np.random.default_rng(1)
    series = list(rng.poisson(5, 70))
    f = forecast_demand(series)
    assert f.status == "ok"
    assert 4 < f.averageDaily < 6
    assert f.weeklySeasonality is False


def test_detects_demonstrated_weekly_seasonality():
    week = [4, 4, 4, 4, 12, 14, 5]
    series = week * 8
    f = forecast_demand(series)
    assert f.weeklySeasonality is True
    assert f.seasonalPValue is not None and f.seasonalPValue < 0.05
    assert f.method == "SES+WEEKLY"


def test_short_history_never_claims_seasonality():
    f = forecast_demand([4, 4, 4, 4, 12, 14, 5] * 3)
    assert f.weeklySeasonality is False


def test_http_contract_matches_api_expectations():
    r = client.post("/forecast", json={"series": [5] * 30})
    assert r.status_code == 200
    body = r.json()
    for key in ["status", "averageDaily", "stdDaily", "observedDays", "confidence", "trendRatio"]:
        assert key in body
    assert client.get("/health").json() == {"status": "ok"}
    assert client.post("/forecast", json={"series": []}).json()["status"] == "insufficient_data"
