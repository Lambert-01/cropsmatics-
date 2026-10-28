"""Mobile intelligence endpoints.

Cropmatics is public-intelligence-first: these endpoints answer "what is
happening in Rwanda's agriculture?" without requiring anybody to register a farm
first. Field operations data (harvests, risk, storage) is served by the older
``/harvests``, ``/risk`` and ``/facilities`` routers and stays separate.

Nothing here fabricates a value. Every count and featured summary is derived from
the processed official tables by ``app.services.mobile_service``.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.schemas.common import Provenance
from app.schemas.mobile import MobileHomeResponse, MobileIndicatorsResponse
from app.services import mobile_service, period_service

router = APIRouter(prefix="/mobile", tags=["mobile"])

def _indicator_limitations() -> list[str]:
    """Limitations built from the coverage matrix, not from literals.

    The multi-period SAS indicator domains (practice, irrigation, water source,
    erosion, post-harvest) really do cover more than one season, while the legacy
    wide district tables still serve a single release. Writing either claim down
    as a constant is how a screen ends up describing a calendar the data does
    not have, so both ranges are read from the tables themselves.
    """
    multi = mobile_service.multi_period_indicator_range()
    legacy = period_service.single_release_scope()
    limitations = [
        "an indicator is only offered when its period carries real coverage",
    ]
    if multi:
        limitations.append(
            f"multi-period SAS indicator rows span {multi}; core practice, irrigation, "
            f"water-source and erosion rows cover 2024A-2026B, district fertilizer-source "
            f"rows cover 2022A-2026B, and legacy wide district tables still serve {legacy} only"
        )
    else:
        limitations.append(f"district-level indicators exist only for {legacy}")
    limitations.append("a missing value is returned as null, never as zero")
    return limitations


@router.get("/home", response_model=MobileHomeResponse)
def home() -> MobileHomeResponse:
    """Home-screen read model: latest period, counts, topics and questions."""
    return MobileHomeResponse(**mobile_service.home())


@router.get("/districts/{slug}")
def district_profile(slug: str) -> dict:
    """Real district read model for the mobile District Detail screen.

    Addressable by ``district_code`` (``RW-NO-RUL``) or slug (``rulindo``).
    Deliberately carries no cross-crop average yield.
    """
    profile = mobile_service.district_profile(slug)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "district not found")
    return profile


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
            limitations=_indicator_limitations(),
        ),
    )
