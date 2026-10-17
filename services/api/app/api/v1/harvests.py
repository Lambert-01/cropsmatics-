"""Harvest registration and post-harvest risk endpoints (database-backed).

Operational field records are personal data, so every route here is scoped to
the signed-in account's ``FarmerProfile``:

* ``POST /harvests`` requires a bearer token and stores ``farmer_id``;
* a ``client_uuid`` repeat only replays for its owner (409 otherwise), and a
  repeat with a *different* payload is refused instead of acknowledged;
* ``GET /harvests/{id}`` and ``POST /harvests/{id}/risk`` answer 404 for a
  registration this account does not own, so ids cannot be probed across
  accounts;
* a ``farm_client_uuid`` that exists under another account is refused rather
  than linked.

Public analytical reads stay public elsewhere (aggregates are a different
contract); only these *individual* records require access.
"""

from __future__ import annotations

import uuid as uuid_lib

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import CurrentFarmerProfile, DbSession
from app.models.farm import Farm
from app.models.harvest import HarvestRegistration, RiskScore
from app.repositories import dataset_repository as repo
from app.schemas.common import Provenance
from app.schemas.harvest import HarvestCreate, HarvestOut, RiskOut
from app.services import risk_service

router = APIRouter(prefix="/harvests", tags=["harvest"])

_EPS = 1e-6


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

def _same_float(left: float | None, right: float | None) -> bool:
    if left is None or right is None:
        return left is None and right is None
    return abs(float(left) - float(right)) <= _EPS


def _same_record(existing: HarvestRegistration, payload: HarvestCreate) -> bool:
    """Whether a repeat upload describes the *same* intended registration."""

    def norm_date(value):
        return value.isoformat() if value else None

    return (
        existing.district_name == payload.district
        and existing.crop_name == payload.crop
        and norm_date(existing.expected_harvest_date)
        == (payload.expected_harvest_date.isoformat() if payload.expected_harvest_date else None)
        and norm_date(existing.harvest_start_date)
        == (payload.harvest_start_date.isoformat() if payload.harvest_start_date else None)
        and norm_date(existing.harvest_end_date)
        == (payload.harvest_end_date.isoformat() if payload.harvest_end_date else None)
        and _same_float(existing.expected_quantity_kg, payload.expected_quantity_kg)
        and _same_float(existing.latitude, payload.latitude)
        and _same_float(existing.longitude, payload.longitude)
        and (existing.notes or None) == (payload.notes or None)
        and bool(existing.needs_storage_assistance) == bool(payload.needs_storage_assistance)
        and (existing.farm_client_uuid or None) == (payload.farm_client_uuid or None)
    )


def _replay(db: Session, existing: HarvestRegistration, payload: HarvestCreate, profile) -> HarvestOut:
    if existing.farmer_id != profile.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "client_uuid is already registered and does not belong to this account",
        )
    if not _same_record(existing, payload):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "client_uuid already describes a different harvest registration",
        )
    # Commit so a get-or-create profile from this request's dependency is
    # durable alongside the acknowledged record.
    db.commit()
    return _to_out(existing)


def _find_harvest(db: Session, client_uuid: str) -> HarvestRegistration | None:
    """Load by idempotency key - the seam a lost insert race shows up at.

    Both the pre-check and the post-``IntegrityError`` recovery use this helper,
    so tests can emulate the stale read a concurrent upload produces and prove
    recovery replays the winner instead of duplicating or returning it unchecked.
    """
    return (
        db.query(HarvestRegistration)
        .filter(HarvestRegistration.client_uuid == client_uuid)
        .one_or_none()
    )


@router.post("", response_model=HarvestOut, status_code=status.HTTP_201_CREATED)
def create_harvest(
    payload: HarvestCreate, db: DbSession, profile: CurrentFarmerProfile
) -> HarvestOut:
    _validate_district_crop(payload.district, payload.crop)

    # Idempotent offline sync: a repeated client_uuid returns the stored row,
    # but only for the account that created it.
    if payload.client_uuid:
        existing = _find_harvest(db, payload.client_uuid)
        if existing:
            return _replay(db, existing, payload, profile)

    harvest = HarvestRegistration(
        farmer_id=profile.id,
        district_name=payload.district,
        crop_name=payload.crop,
        expected_harvest_date=payload.expected_harvest_date,
        harvest_start_date=payload.harvest_start_date,
        harvest_end_date=payload.harvest_end_date,
        expected_quantity_kg=payload.expected_quantity_kg,
        latitude=payload.latitude,
        longitude=payload.longitude,
        notes=payload.notes,
        needs_storage_assistance=payload.needs_storage_assistance,
        client_uuid=payload.client_uuid,
        farm_client_uuid=payload.farm_client_uuid,
        farm_id=_farm_id_for(db, payload.farm_client_uuid, profile),
        is_offline_created=bool(payload.client_uuid),
        sync_status="SYNCED",
        source_id="MOBILE_OPERATIONAL",
        source_period="operational",
    )
    try:
        with db.begin_nested():  # SAVEPOINT: concurrent duplicate upload
            db.add(harvest)  # inside the savepoint so its rollback expunges it
            db.flush()
    except IntegrityError as exc:
        winner = None
        if harvest in db:
            db.expunge(harvest)
        if payload.client_uuid:
            winner = _find_harvest(db, payload.client_uuid)
        if winner is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "registration could not be stored"
            ) from exc
        # The winner must pass the same owner/identity checks, not be handed
        # back just because the UUID matched - and the commit that acknowledges
        # it happens inside _replay.
        return _replay(db, winner, payload, profile)

    db.commit()
    db.refresh(harvest)
    return _to_out(harvest)


def _farm_id_for(db: Session, farm_client_uuid: str | None, profile):
    """The *own* farm this registration belongs to, if it has synced already.

    A farm that has not uploaded yet is not an error: the farm route links the
    registration back when its own upload arrives. A farm that exists but
    belongs to another account is refused - cross-account linking must never
    happen, silently or otherwise.
    """
    if not farm_client_uuid:
        return None
    farm = db.query(Farm).filter(Farm.client_uuid == farm_client_uuid).one_or_none()
    if farm is None:
        return None
    if farm.farmer_id != profile.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "farm_client_uuid is already registered and does not belong to this account",
        )
    return farm.id


def _owned_harvest(db: Session, harvest_id: str, profile) -> HarvestRegistration:
    """Load a registration by id, 404 for ids this account does not own."""
    try:
        row_id = uuid_lib.UUID(str(harvest_id))
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "harvest not found") from None
    harvest = db.get(HarvestRegistration, row_id)
    if harvest is None or harvest.farmer_id != profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "harvest not found")
    return harvest


@router.get("/{harvest_id}", response_model=HarvestOut)
def get_harvest(harvest_id: str, db: DbSession, profile: CurrentFarmerProfile) -> HarvestOut:
    return _to_out(_owned_harvest(db, harvest_id, profile))


@router.post("/{harvest_id}/risk", response_model=RiskOut)
def score_risk(
    harvest_id: str, db: DbSession, profile: CurrentFarmerProfile
) -> RiskOut:
    harvest = _owned_harvest(db, harvest_id, profile)

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
        model_version=result.model_version,
        source_id="MOBILE_OPERATIONAL",
    ))
    db.commit()

    return RiskOut(
        harvest_id=str(harvest.id),
        probability=result.probability,
        band=result.band,
        contributing_factors=result.contributing_factors,
        recommended_actions=result.recommended_actions,
        score_label=result.score_label,
        model_version=result.model_version,
        factors=[factor.as_dict() for factor in result.factors],
        actions=[action.as_dict() for action in result.actions],
        capacity_context="capacity_not_verified",
        provenance=Provenance(
            model_version=result.model_version,
            method="documented additive rule model",
            limitations=["rule weights are expert-set, not calibrated on local outcomes yet"],
        ),
    )
