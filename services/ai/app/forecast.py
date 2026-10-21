"""Demand forecasting for Stock Autopilot (advanced path).

Same contract as packages/shared/src/logic/forecast.ts so the API can use either
implementation. The model is deliberately conservative:

* simple exponential smoothing on daily demand;
* a day-of-week seasonal profile is applied ONLY when it is statistically
  demonstrated (one-way ANOVA across weekdays, p < 0.05, at least 4 full weeks);
  otherwise the series is treated as non-seasonal;
* no forecast at all ("insufficient_data") when history is missing or too short.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Literal, Optional

import numpy as np
from scipy import stats

MIN_HISTORY_DAYS = 14
MIN_DAYS_WITH_SALES = 3
MIN_WEEKS_FOR_SEASONALITY = 4
SEASONALITY_P_VALUE = 0.05


@dataclass
class Forecast:
    status: Literal["ok"]
    averageDaily: float
    stdDaily: float
    meanDaily: float
    observedDays: int
    daysWithSales: int
    trendRatio: Optional[float]
    confidence: Literal["HIGH", "MEDIUM", "LOW"]
    method: str
    weeklySeasonality: bool
    seasonalPValue: Optional[float]


@dataclass
class Insufficient:
    status: Literal["insufficient_data"]
    observedDays: int
    daysWithSales: int
    reason: Literal["NO_HISTORY", "TOO_SHORT", "NO_SALES"]


def _ses(series: np.ndarray, alpha: float) -> float:
    level = float(series[: min(7, len(series))].mean())
    for x in series:
        level = alpha * float(x) + (1 - alpha) * level
    return level


def weekly_profile(series: np.ndarray) -> tuple[Optional[np.ndarray], Optional[float]]:
    """Returns (multiplicative weekday indices, p-value) if seasonality is significant, else (None, p)."""
    weeks = len(series) // 7
    if weeks < MIN_WEEKS_FOR_SEASONALITY or series.mean() <= 0:
        return None, None
    trimmed = series[-weeks * 7 :]
    groups = [trimmed[d::7] for d in range(7)]
    if np.allclose(trimmed, trimmed[0]):
        return None, 1.0  # perfectly flat demand: nothing to model
    with np.errstate(all="ignore"):
        _, p = stats.f_oneway(*groups)
    p = float(p) if np.isfinite(p) else 1.0
    if p >= SEASONALITY_P_VALUE:
        return None, p
    means = np.array([g.mean() for g in groups])
    indices = means / trimmed.mean()
    # Align indices with the original series start.
    offset = (len(series) - weeks * 7) % 7
    return np.roll(indices, offset), p


def forecast_demand(series: list[float], alpha: float = 0.2) -> Forecast | Insufficient:
    arr = np.asarray(series, dtype=float)
    observed = int(arr.size)
    with_sales = int((arr > 0).sum())
    if observed == 0:
        return Insufficient("insufficient_data", observed, with_sales, "NO_HISTORY")
    if with_sales == 0:
        return Insufficient("insufficient_data", observed, with_sales, "NO_SALES")
    if observed < MIN_HISTORY_DAYS or with_sales < MIN_DAYS_WITH_SALES:
        return Insufficient("insufficient_data", observed, with_sales, "TOO_SHORT")

    indices, p_value = weekly_profile(arr)
    if indices is not None:
        idx = np.resize(indices, observed)
        deseason = arr / np.where(idx > 0, idx, 1)
        level = _ses(deseason, alpha)
        # Variability once the weekday effect is removed drives safety stock.
        std = float(deseason.std(ddof=1))
        method = "SES+WEEKLY"
    else:
        level = _ses(arr, alpha)
        std = float(arr.std(ddof=1)) if observed > 1 else 0.0
        method = "SES"

    mean = float(arr.mean())
    recent, previous = arr[-14:], arr[-28:-14]
    trend = float(recent.mean() / previous.mean()) if previous.size == 14 and previous.mean() > 0 else None
    cv = std / mean if mean > 0 else float("inf")
    confidence: Literal["HIGH", "MEDIUM", "LOW"] = "LOW"
    if observed >= 56 and cv < 1:
        confidence = "HIGH"
    elif observed >= 28 and cv < 2:
        confidence = "MEDIUM"

    return Forecast(
        status="ok",
        averageDaily=round(level, 4),
        stdDaily=round(std, 4),
        meanDaily=round(mean, 4),
        observedDays=observed,
        daysWithSales=with_sales,
        trendRatio=None if trend is None else round(trend, 3),
        confidence=confidence,
        method=method,
        weeklySeasonality=indices is not None,
        seasonalPValue=None if p_value is None else round(p_value, 4),
    )


def to_dict(result: Forecast | Insufficient) -> dict:
    return asdict(result)
