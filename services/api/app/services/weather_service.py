"""External weather context for operational screens.

Weather is deliberately kept outside the official NISR analytical layer. This
service provides short-range context only; it does not calculate yield,
productivity gaps, intervention scores, or forecasts for official reporting.
"""

from __future__ import annotations

import json
import os
import time
from functools import lru_cache
from threading import Lock

import httpx

from app.core.config import REPO_ROOT
from app.repositories import dataset_repository as repo

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_SOURCE_ID = "OPEN_METEO_FORECAST"
MET_NO_URL = "https://api.met.no/weatherapi/locationforecast/2.0/compact"
MET_NO_SOURCE_ID = "MET_NO_LOCATIONFORECAST"
MET_NO_PROVIDER_URL = "https://api.met.no/weatherapi/locationforecast/2.0/documentation"
_CACHE_TTL_SECONDS = 600.0
_FAILURE_TTL_SECONDS = 30.0
_cache: dict[tuple[float, float], tuple[float, dict]] = {}
_failure_cache: dict[tuple[float, float], float] = {}
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


def _request_json(url: str, *, params: dict[str, object], headers: dict[str, str] | None = None) -> dict:
    with httpx.Client(timeout=8.0, headers=headers) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("weather provider returned a non-object payload")
    return payload


def _open_meteo_payload(latitude: float, longitude: float) -> dict:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code",
        "forecast_days": 3,
        "timezone": "Africa/Kigali",
    }
    payload = _request_json(OPEN_METEO_URL, params=params)
    return {
        **payload,
        "_provider": "Open-Meteo",
        "_provider_url": "https://open-meteo.com/",
        "_source_id": OPEN_METEO_SOURCE_ID,
        "_method": "Open-Meteo forecast API at a Rwanda district centroid or supplied coordinates",
    }


def _met_no_point_details(point: dict) -> dict:
    return ((point.get("data") or {}).get("instant") or {}).get("details") or {}


def _met_no_precipitation(point: dict) -> float | None:
    data = point.get("data") or {}
    for window in ("next_1_hours", "next_6_hours", "next_12_hours"):
        details = (data.get(window) or {}).get("details") or {}
        value = _number(details.get("precipitation_amount"))
        if value is not None:
            return value
    return None


def _met_no_payload(payload: dict) -> dict:
    """Convert MET Norway's hourly GeoJSON forecast into our shared shape."""
    points = payload.get("properties", {}).get("timeseries") or []
    if not points:
        raise ValueError("MET Norway returned no forecast timeseries")

    grouped: dict[str, list[dict]] = {}
    for point in points:
        date = str(point.get("time") or "")[:10]
        if date:
            grouped.setdefault(date, []).append(point)

    current = points[0]
    current_details = _met_no_point_details(current)
    daily_rows = []
    for date in sorted(grouped)[:3]:
        day_points = grouped[date]
        temperatures = [
            value
            for value in (_number(_met_no_point_details(point).get("air_temperature")) for point in day_points)
            if value is not None
        ]
        winds = [
            value * 3.6
            for value in (_number(_met_no_point_details(point).get("wind_speed")) for point in day_points)
            if value is not None
        ]
        precipitation = [
            value for value in (_met_no_precipitation(point) for point in day_points) if value is not None
        ]
        daily_rows.append(
            {
                "date": date,
                "temperature_max_c": max(temperatures) if temperatures else None,
                "temperature_min_c": min(temperatures) if temperatures else None,
                "precipitation_sum_mm": sum(precipitation) if precipitation else None,
                "precipitation_probability_pct": None,
                "wind_speed_max_kmh": max(winds) if winds else None,
                "weather_code": None,
            }
        )

    return {
        "current": {
            "time": current.get("time"),
            "temperature_2m": _number(current_details.get("air_temperature")),
            "relative_humidity_2m": _number(current_details.get("relative_humidity")),
            "precipitation": _met_no_precipitation(current),
            "wind_speed_10m": (
                _number(current_details.get("wind_speed")) * 3.6
                if _number(current_details.get("wind_speed")) is not None
                else None
            ),
            "weather_code": None,
        },
        "daily": {
            "time": [row["date"] for row in daily_rows],
            "temperature_2m_max": [row["temperature_max_c"] for row in daily_rows],
            "temperature_2m_min": [row["temperature_min_c"] for row in daily_rows],
            "precipitation_sum": [row["precipitation_sum_mm"] for row in daily_rows],
            "precipitation_probability_max": [
                row["precipitation_probability_pct"] for row in daily_rows
            ],
            "wind_speed_10m_max": [row["wind_speed_max_kmh"] for row in daily_rows],
            "weather_code": [row["weather_code"] for row in daily_rows],
        },
        "_provider": "MET Norway",
        "_provider_url": MET_NO_PROVIDER_URL,
        "_source_id": MET_NO_SOURCE_ID,
        "_method": "MET Norway Locationforecast at a Rwanda district centroid or supplied coordinates",
    }


def _met_no_payload_for(latitude: float, longitude: float) -> dict:
    user_agent = os.getenv(
        "CROPMATICS_WEATHER_USER_AGENT",
        "Cropmatics/1.0 (https://cropsmatics-web.vercel.app)",
    )
    payload = _request_json(
        MET_NO_URL,
        params={"lat": latitude, "lon": longitude},
        headers={"User-Agent": user_agent},
    )
    return _met_no_payload(payload)


def _fetch(latitude: float, longitude: float) -> dict:
    key = (round(latitude, 4), round(longitude, 4))
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(key)
        if cached and now - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]
        failed_at = _failure_cache.get(key)
        if failed_at and now - failed_at < _FAILURE_TTL_SECONDS:
            raise WeatherUnavailable("weather providers are temporarily rate-limited")

    try:
        payload = _open_meteo_payload(latitude, longitude)
    except (httpx.HTTPError, ValueError):
        try:
            payload = _met_no_payload_for(latitude, longitude)
        except (httpx.HTTPError, ValueError) as error:
            with _cache_lock:
                _failure_cache[key] = time.monotonic()
            raise WeatherUnavailable("weather providers did not return context") from error

    with _cache_lock:
        _cache[key] = (time.monotonic(), payload)
        _failure_cache.pop(key, None)
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
        "provider": payload.get("_provider", "Open-Meteo"),
        "provider_url": payload.get("_provider_url", "https://open-meteo.com/"),
        "note": (
            "External weather context for planning. It is not an official NISR "
            "statistic and is not used as a yield prediction."
        ),
        "provenance": {
            "source_id": payload.get("_source_id", OPEN_METEO_SOURCE_ID),
            "method": payload.get(
                "_method",
                "Open-Meteo forecast API at a Rwanda district centroid or supplied coordinates",
            ),
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
        _failure_cache.clear()
    _district_centroids.cache_clear()
