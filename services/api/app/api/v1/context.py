"""External, non-official operational context endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.schemas.weather import WeatherContextResponse
from app.services import weather_service

router = APIRouter(prefix="/context", tags=["external context"])


@router.get("/weather", response_model=WeatherContextResponse)
def weather(
    district_code: str | None = Query(None, min_length=2),
    latitude: float | None = Query(None, ge=-90, le=90),
    longitude: float | None = Query(None, ge=-180, le=180),
) -> WeatherContextResponse:
    try:
        return WeatherContextResponse(
            **weather_service.context(
                district_code=district_code, latitude=latitude, longitude=longitude
            )
        )
    except weather_service.WeatherInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except weather_service.WeatherUnavailable as error:
        raise HTTPException(
            status_code=502,
            detail="External weather context is temporarily unavailable. Try again later.",
        ) from error
