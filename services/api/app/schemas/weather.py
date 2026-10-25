"""Weather context response models."""

from __future__ import annotations

from pydantic import BaseModel

from app.schemas.common import Provenance


class WeatherLocation(BaseModel):
    district_code: str | None = None
    district: str | None = None
    province: str | None = None
    latitude: float
    longitude: float
    resolution: str


class WeatherCurrent(BaseModel):
    observed_at: str | None = None
    temperature_c: float | None = None
    relative_humidity_pct: float | None = None
    precipitation_mm: float | None = None
    wind_speed_kmh: float | None = None
    weather_code: int | None = None


class WeatherDaily(BaseModel):
    date: str
    temperature_max_c: float | None = None
    temperature_min_c: float | None = None
    precipitation_sum_mm: float | None = None
    precipitation_probability_pct: float | None = None
    wind_speed_max_kmh: float | None = None
    weather_code: int | None = None


class WeatherContextResponse(BaseModel):
    available: bool = True
    location: WeatherLocation
    current: WeatherCurrent
    daily: list[WeatherDaily]
    provider: str = "Open-Meteo"
    provider_url: str = "https://open-meteo.com/"
    note: str
    provenance: Provenance
