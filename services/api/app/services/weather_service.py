"""External weather context for operational screens.

Weather is deliberately kept outside the official NISR analytical layer. This
service provides short-range context only; it does not calculate yield,
productivity gaps, intervention scores, or forecasts for official reporting.
"""

from __future__ import annotations

import json
import time
from functools import lru_cache
from threading import Lock

import httpx

from app.core.config import REPO_ROOT
from app.repositories import dataset_repository as repo

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_SOURCE_ID = "OPEN_METEO_FORECAST"
_CACHE_TTL_SECONDS = 600.0
_cache: dict[tuple[float, float], tuple[float, dict]] = {}
_cache_lock = Lock()


class WeatherInputError(ValueError):
    """Raised when a weather location cannot be resolved."""


class WeatherUnavailable(RuntimeError):
    """Raised when the external provider cannot provide a response."""


def _flatten_coordinates(value: object) -> list[tuple[float, float]]:
    """Collect longitude/latitude pairs from Polygon or MultiPolygon geometry."""
    if not isinstance(value, list) or not value:
        return []
    first = value[0]
    if isinstance(first, int | float) and len(value) >= 2:
        return [(float(value[0]), float(value[1]))]
    points: list[tuple[float, float]] = []
    for child in value:
        points.extend(_flatten_coordinates(child))
    return points


@lru_cache(maxsize=1)
def _district_centroids() -> dict[str, dict]:
    """Derive approximate centroids from the checked-in district GeoJSON."""
    path = REPO_ROOT / "apps" / "web" / "public" / "geodata" / "rwanda_districts.geojson"
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    centroids: dict[str, dict] = {}
    for feature in payload.get("features", []):
        properties = feature.get("properties") or {}
        district_code = str(properties.get("district_code") or "").strip()
        points = _flatten_coordinates((feature.get("geometry") or {}).get("coordinates"))
        if not district_code or not points:
            continue
        centroids[district_code] = {
            "district_code": district_code,
            "district": properties.get("district"),
            "province": properties.get("province"),
            "latitude": sum(point[1] for point in points) / len(points),
            "longitude": sum(point[0] for point in points) / len(points),
        }
    return centroids


def _resolve_district(district_code: str) -> dict | None:
    target = district_code.strip().lower()
    centroids = _district_centroids()
    for code, location in centroids.items():
        if code.lower() == target or str(location.get("district", "")).lower() == target:
            return location

    try:
        districts = repo.districts()
    except Exception:  # noqa: BLE001 - a missing dictionary becomes a clean 422
        return None
    for _, row in districts.iterrows():
        code = str(row.get("district_code") or "").strip()
        name = str(row.get("district") or "").strip()
        location = centroids.get(code)
        if location and (code.lower() == target or name.lower() == target):
            return {**location, "district": name, "province": row.get("province")}
    return None


def _location(
    *, district_code: str | None, latitude: float | None, longitude: float | None
) -> dict:
    if district_code:
        resolved = _resolve_district(district_code)
        if resolved is None:
            raise WeatherInputError("district_code is not a recognised Rwanda district")
        return {**resolved, "resolution": "district_centroid"}
    if latitude is None or longitude is None:
        raise WeatherInputError(
            "provide district_code or provide both latitude and longitude"
        )
    return {
        "district_code": None,
        "district": None,
        "province": None,
        "latitude": latitude,
        "longitude": longitude,
        "resolution": "coordinates",
    }


def _number(value: object) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _integer(value: object) -> int | None:
    try:
        return None if value is None else int(value)
    except (TypeError, ValueError):
        return None


def _fetch(latitude: float, longitude: float) -> dict:
    key = (round(latitude, 4), round(longitude, 4))
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(key)
        if cached and now - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code",
        "forecast_days": 3,
        "timezone": "Africa/Kigali",
    }
    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.get(OPEN_METEO_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise WeatherUnavailable("Open-Meteo did not return weather context") from error

    with _cache_lock:
        _cache[key] = (time.monotonic(), payload)
    return payload


def context(
    *, district_code: str | None = None, latitude: float | None = None, longitude: float | None = None
) -> dict:
    location = _location(
        district_code=district_code, latitude=latitude, longitude=longitude
    )
    payload = _fetch(location["latitude"], location["longitude"])
    current = payload.get("current") or {}
    daily = payload.get("daily") or {}

    dates = daily.get("time") or []
    daily_rows = []
    for index, date in enumerate(dates):
        daily_rows.append(
            {
                "date": str(date),
                "temperature_max_c": _number((daily.get("temperature_2m_max") or [])[index]),
                "temperature_min_c": _number((daily.get("temperature_2m_min") or [])[index]),
                "precipitation_sum_mm": _number((daily.get("precipitation_sum") or [])[index]),
                "precipitation_probability_pct": _number(
                    (daily.get("precipitation_probability_max") or [])[index]
                ),
                "wind_speed_max_kmh": _number((daily.get("wind_speed_10m_max") or [])[index]),
                "weather_code": _integer((daily.get("weather_code") or [])[index]),
            }
        )

    return {
        "available": True,
        "location": location,
        "current": {
            "observed_at": current.get("time"),
            "temperature_c": _number(current.get("temperature_2m")),
            "relative_humidity_pct": _number(current.get("relative_humidity_2m")),
            "precipitation_mm": _number(current.get("precipitation")),
            "wind_speed_kmh": _number(current.get("wind_speed_10m")),
            "weather_code": _integer(current.get("weather_code")),
        },
        "daily": daily_rows,
        "provider": "Open-Meteo",
        "provider_url": "https://open-meteo.com/",
        "note": (
            "External weather context for planning. It is not an official NISR "
            "statistic and is not used as a yield prediction."
        ),
        "provenance": {
            "source_id": OPEN_METEO_SOURCE_ID,
            "method": "Open-Meteo forecast API at a Rwanda district centroid or supplied coordinates",
            "limitations": [
                "short-range forecast context, not observed harvest data",
                "district values represent an approximate centroid, not every farm",
                "weather context does not establish crop-yield causality",
            ],
        },
    }


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()
    _district_centroids.cache_clear()
