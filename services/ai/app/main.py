"""StockItEasy AI service — optional advanced forecasting used by Stock Autopilot.

The NestJS API calls POST /forecast when AI_SERVICE_URL is configured and falls
back to its built-in statistical model otherwise.
"""

from fastapi import FastAPI
from pydantic import BaseModel, Field

from .forecast import forecast_demand, to_dict

app = FastAPI(title="StockItEasy AI service", version="0.1.0")


class ForecastRequest(BaseModel):
    series: list[float] = Field(default_factory=list, max_length=3650, description="Daily demand, oldest first")
    alpha: float = Field(default=0.2, gt=0, lt=1)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/forecast")
def forecast(req: ForecastRequest) -> dict:
    series = [max(0.0, float(x)) for x in req.series]
    return to_dict(forecast_demand(series, req.alpha))
