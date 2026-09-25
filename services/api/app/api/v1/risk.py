"""Stateless post-harvest risk endpoint.

The mobile app must never compute the risk score itself, so this endpoint lets a
registered (or not-yet-synced) harvest be scored directly. The response includes
the contributions and provenance so the app can explain *why*.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.repositories import dataset_repository as repo
from app.schemas.common import Provenance
from app.services import risk_service

router = APIRouter(prefix="/risk", tags=["risk"])


class RiskRequest(BaseModel):
    crop: str
    expected_quantity_kg: float | None = Field(default=None, ge=0)
    perishability: str | None = None
    rainfall_risk: str | None = None
    distance_km: float | None = Field(default=None, ge=0)
    capacity_available_kg: float | None = Field(default=None, ge=0)


class RiskResponse(BaseModel):
    probability: float
    band: str
    contributing_factors: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    capacity_context: str
    provenance: Provenance


@router.post("/post-harvest", response_model=RiskResponse)
def post_harvest_risk(payload: RiskRequest) -> RiskResponse:
    perishability = payload.perishability
    if perishability is None:
        crops = repo.crops()
        match = crops[crops["crop_name"].astype(str) == payload.crop]
        if not match.empty:
            perishability = match.iloc[0].get("perishability")

    result = risk_service.score(
        crop=payload.crop,
        expected_quantity_kg=payload.expected_quantity_kg,
        perishability=perishability,
        rainfall_risk=payload.rainfall_risk,
        distance_km=payload.distance_km,
        capacity_available_kg=payload.capacity_available_kg,
    )
    return RiskResponse(
        probability=result.probability,
        band=result.band,
        contributing_factors=result.contributing_factors,
        recommended_actions=result.recommended_actions,
        capacity_context=(
            "capacity_not_verified" if payload.capacity_available_kg is None else "capacity_provided"
        ),
        provenance=Provenance(
            model_version="rule-based-risk-0.1.0",
            method="documented additive rule model (not a calibrated classifier)",
            limitations=[
                "rule weights are expert-set, not calibrated on local outcomes yet",
                "capacity is treated conservatively when unverified",
            ],
        ),
    )
