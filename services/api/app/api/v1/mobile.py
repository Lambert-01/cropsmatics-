"""Mobile intelligence endpoints.

Cropmatics is public-intelligence-first: these endpoints answer "what is
happening in Rwanda's agriculture?" without requiring anybody to register a farm
first. Field operations data (harvests, risk, storage) is served by the older
``/harvests``, ``/risk`` and ``/facilities`` routers and stays separate.

Nothing here fabricates a value. Every count and featured summary is derived from
the processed official tables by ``app.services.mobile_service``.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.common import Provenance
from app.schemas.mobile import MobileHomeResponse, MobileIndicatorsResponse
from app.services import mobile_service

router = APIRouter(prefix="/mobile", tags=["mobile"])

INDICATOR_LIMITATIONS = [
    "an indicator is only offered when its period carries real coverage",
    "district-level indicators exist only for 2025 Season B",
    "a missing value is returned as null, never as zero",
]


@router.get("/home", response_model=MobileHomeResponse)
def home() -> MobileHomeResponse:
    """Home-screen read model: latest period, counts, topics and questions."""
    return MobileHomeResponse(**mobile_service.home())


@router.get("/indicators", response_model=MobileIndicatorsResponse)
def indicators() -> MobileIndicatorsResponse:
    """Indicator catalogue annotated with real availability and coverage."""
    period = mobile_service.latest_district_period()
    return MobileIndicatorsResponse(
        latest_period=period,
        latest_period_label=mobile_service.format_period(period),
        categories=mobile_service.indicator_categories(),
        indicators=mobile_service.indicator_catalog(),
        provenance=Provenance(
            source_id="NISR_SAS_2025B_DISTRICT_CROP",
            source_period=period,
            method="indicator registry cross-checked against the processed coverage matrix",
            limitations=INDICATOR_LIMITATIONS,
        ),
    )
