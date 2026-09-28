"""Market Intelligence endpoints.

The domain is fully built and answers with zero observations, because that is its
current honest state (see ``app.services.market_service``). Every endpoint states
whether data are available and why not, rather than returning an empty page that
could be mistaken for "no price change".

Price types are never combined: ``/markets/trend`` returns one series per type,
``/markets/dispersion`` one range per type, and ``/markets/latest`` one row per
commodity x market x price type.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.services import market_service

router = APIRouter(prefix="/markets", tags=["markets"])


@router.get("/status")
def status() -> dict:
    """Whether verified market prices are loaded, and what is behind that answer."""
    return market_service.status()


@router.get("/coverage")
def coverage() -> dict:
    """Observation counts per commodity, market, district, province and price type."""
    return market_service.coverage()


@router.get("/commodities")
def commodities() -> dict:
    rows = market_service.commodities()
    return {
        "data_available": bool(rows),
        "commodities": rows,
        "reason": None if rows else market_service.NO_DATA_REASON,
    }


@router.get("/markets")
def markets() -> dict:
    rows = market_service.markets()
    return {
        "data_available": bool(rows),
        "markets": rows,
        "reason": None if rows else market_service.NO_DATA_REASON,
    }


@router.get("/observations")
def observations(
    commodity: str | None = Query(None, description="commodity name, e.g. Maize"),
    market: str | None = Query(None),
    district: str | None = Query(None),
    province: str | None = Query(None),
    price_type: str | None = Query(
        None, description="farmgate | producer | wholesale | retail | assembly | unspecified"
    ),
    date_from: str | None = Query(None, description="ISO date, inclusive"),
    date_to: str | None = Query(None, description="ISO date, inclusive"),
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> dict:
    """Raw verified price observations, newest first."""
    return market_service.observations(
        commodity=commodity,
        market=market,
        district=district,
        province=province,
        price_type=price_type,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@router.get("/latest")
def latest(
    commodity: str | None = Query(None),
    market: str | None = Query(None),
    district: str | None = Query(None),
    province: str | None = Query(None),
    price_type: str | None = Query(None),
) -> dict:
    """Most recent observation per commodity x market x price type."""
    return market_service.latest(
        commodity=commodity,
        market=market,
        district=district,
        province=province,
        price_type=price_type,
    )


@router.get("/trend")
def trend(
    commodity: str = Query(..., min_length=1, description="commodity name, e.g. Maize"),
    market: str | None = Query(None),
    district: str | None = Query(None),
    price_type: str | None = Query(None),
) -> dict:
    """Observed price over time, returned as one series per price type."""
    return market_service.trend(
        commodity=commodity, market=market, district=district, price_type=price_type
    )


@router.get("/dispersion")
def dispersion(
    commodity: str = Query(..., min_length=1),
    market: str | None = Query(None),
    district: str | None = Query(None),
    price_type: str | None = Query(None),
) -> dict:
    """Observed range per price type, with its observation count."""
    return market_service.dispersion(
        commodity=commodity, market=market, district=district, price_type=price_type
    )
