from __future__ import annotations

from app.services import weather_service


def _payload() -> dict:
    return {
        "current": {
            "time": "2026-10-24T12:00",
            "temperature_2m": 24.5,
            "relative_humidity_2m": 67,
            "precipitation": 0.2,
            "wind_speed_10m": 8.1,
            "weather_code": 3,
        },
        "daily": {
            "time": ["2026-10-24", "2026-10-25", "2026-10-26"],
            "temperature_2m_max": [25, 26, 24],
            "temperature_2m_min": [16, 17, 15],
            "precipitation_sum": [2.1, 4.2, 0],
            "precipitation_probability_max": [20, 50, 10],
            "wind_speed_10m_max": [12, 14, 10],
            "weather_code": [3, 61, 1],
        },
    }


def test_weather_context_resolves_canonical_district(client, monkeypatch):
    weather_service.clear_cache()
    monkeypatch.setattr(weather_service, "_fetch", lambda latitude, longitude: _payload())

    response = client.get("/api/v1/context/weather?district_code=RW-KG-GAS")

    assert response.status_code == 200
    body = response.json()
    assert body["location"]["district_code"] == "RW-KG-GAS"
    assert body["location"]["district"] == "Gasabo"
    assert body["location"]["resolution"] == "district_centroid"
    assert body["current"]["temperature_c"] == 24.5
    assert len(body["daily"]) == 3
    assert body["provenance"]["source_id"] == "OPEN_METEO_FORECAST"
    assert "not an official NISR statistic" in body["note"]


def test_weather_context_resolves_gakenke_by_name(client, monkeypatch):
    weather_service.clear_cache()
    monkeypatch.setattr(weather_service, "_fetch", lambda latitude, longitude: _payload())

    response = client.get("/api/v1/context/weather?district_code=Gakenke")

    assert response.status_code == 200
    location = response.json()["location"]
    assert location["district_code"] == "RW-NO-GAK"
    assert location["district"] == "Gakenke"
    assert location["province"] == "Northern"


def test_weather_context_accepts_coordinates(client, monkeypatch):
    weather_service.clear_cache()
    monkeypatch.setattr(weather_service, "_fetch", lambda latitude, longitude: _payload())

    response = client.get("/api/v1/context/weather?latitude=-1.95&longitude=30.06")

    assert response.status_code == 200
    assert response.json()["location"]["resolution"] == "coordinates"
    assert response.json()["location"]["district"] is None


def test_weather_context_requires_a_location(client):
    response = client.get("/api/v1/context/weather")

    assert response.status_code == 422
    assert "district_code or provide both" in response.json()["detail"]


def test_weather_context_reports_provider_failure(client, monkeypatch):
    def fail(latitude, longitude):
        raise weather_service.WeatherUnavailable("provider unavailable")

    monkeypatch.setattr(weather_service, "_fetch", fail)

    response = client.get("/api/v1/context/weather?district_code=RW-KG-GAS")

    assert response.status_code == 502
    assert "temporarily unavailable" in response.json()["detail"]
