"""Harvest registration and post-harvest risk endpoints (database-backed)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import DbSession
from app.models.harvest import HarvestRegistration, RiskScore
from app.repositories import dataset_repository as repo
from app.schemas.common import Provenance
from app.schemas.harvest import HarvestCreate, HarvestOut, RiskOut
from app.services import risk_service

router = APIRouter(prefix="/harvests", tags=["harvest"])


def _validate_district_crop(district: str, crop: str) -> None:
    districts = set(repo.districts()["district"].astype(str))
    crops = set(repo.crops()["crop_name"].astype(str))
    if district not in districts:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"unknown district: {district}")
    if crop not in crops:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"unknown crop: {crop}")


def _to_out(h: HarvestRegistration) -> HarvestOut:
    return HarvestOut(
        id=str(h.id),
        district=h.district_name or "",
        crop=h.crop_name or "",
        expected_harvest_date=h.expected_harvest_date,
        expected_quantity_kg=h.expected_quantity_kg,
        actual_quantity_kg=h.actual_quantity_kg,
        sync_status=h.sync_status,
    )


@router.post("", response_model=HarvestOut, status_code=status.HTTP_201_CREATED)
def create_harvest(payload: HarvestCreate, db: DbSession) -> HarvestOut:
    _validate_district_crop(payload.district, payload.crop)

    # Idempotent offline sync: a repeated client_uuid returns the stored row.
    if payload.client_uuid:
        existing = (
            db.query(HarvestRegistration)
            .filter(HarvestRegistration.client_uuid == payload.client_uuid)
            .one_or_none()
        )
        if existing:
            return _to_out(existing)

    harvest = HarvestRegistration(
        district_name=payload.district,
        crop_name=payload.crop,
        expected_harvest_date=payload.expected_harvest_date,
        expected_quantity_kg=payload.expected_quantity_kg,
        client_uuid=payload.client_uuid,
        is_offline_created=bool(payload.client_uuid),
        sync_status="SYNCED",
        source_id="MOBILE_OPERATIONAL",
        source_period="operational",
    )
    db.add(harvest)
    db.commit()
    db.refresh(harvest)
    return _to_out(harvest)


@router.get("/{harvest_id}", response_model=HarvestOut)
def get_harvest(harvest_id: str, db: DbSession) -> HarvestOut:
    harvest = db.get(HarvestRegistration, harvest_id)
    if harvest is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "harvest not found")
    return _to_out(harvest)


@router.post("/{harvest_id}/risk", response_model=RiskOut)
def score_risk(harvest_id: str, db: DbSession) -> RiskOut:
    harvest = db.get(HarvestRegistration, harvest_id)
    if harvest is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "harvest not found")

    crop_row = repo.crops()
    match = crop_row[crop_row["crop_name"] == harvest.crop_name]
    perishability = match.iloc[0]["perishability"] if not match.empty else None

    result = risk_service.score(
        crop=harvest.crop_name or "",
        expected_quantity_kg=harvest.expected_quantity_kg,
        perishability=perishability,
        capacity_available_kg=None,  # not verified: handled conservatively
    )

    db.add(RiskScore(
        harvest_id=harvest.id,
        probability=result.probability,
        band=result.band,
        contributing_factors="; ".join(result.contributing_factors),
        recommended_actions="; ".join(result.recommended_actions),
        model_version="rule-based-risk-0.1.0",
        source_id="MOBILE_OPERATIONAL",
    ))
    db.commit()

    return RiskOut(
        harvest_id=str(harvest.id),
        probability=result.probability,
        band=result.band,
        contributing_factors=result.contributing_factors,
        recommended_actions=result.recommended_actions,
        capacity_context="capacity_not_verified",
        provenance=Provenance(
            model_version="rule-based-risk-0.1.0",
            method="documented additive rule model",
            limitations=["rule weights are expert-set, not calibrated on local outcomes yet"],
        ),
    )
