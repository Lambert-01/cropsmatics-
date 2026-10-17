"""Farm profile upload (offline-first mobile sync).

The mobile queue uploads a farm profile *before* it marks the local outbox
entry synced, so this endpoint must be idempotent on the client-generated
``client_uuid``: a retry after a timeout returns the stored row instead of
creating a duplicate.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.api.deps import DbSession
from app.models.farm import Farm
from app.models.harvest import HarvestRegistration
from app.repositories import dataset_repository as repo
from app.schemas.farm import FarmCreate, FarmOut

router = APIRouter(prefix="/farms", tags=["farm"])


def _validate_district(district: str) -> None:
    districts = set(repo.districts()["district"].astype(str))
    if district not in districts:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"unknown district: {district}")


def _to_out(farm: Farm) -> FarmOut:
    return FarmOut(
        id=str(farm.id),
        client_uuid=farm.client_uuid,
        district=farm.district_name,
        name=farm.name,
        farm_size_ha=farm.area_ha,
    )


@router.post("", response_model=FarmOut, status_code=status.HTTP_201_CREATED)
def create_farm(payload: FarmCreate, db: DbSession) -> FarmOut:
    _validate_district(payload.district)

    if payload.client_uuid:
        existing = (
            db.query(Farm).filter(Farm.client_uuid == payload.client_uuid).one_or_none()
        )
        if existing:
            _link_pending_harvests(db, payload.client_uuid, existing.id)
            db.commit()
            return _to_out(existing)

    farm = Farm(
        # Registered in the field, before any account exists; the link to a
        # farmer profile happens later, when there is one to link.
        farmer_id=None,
        district_name=payload.district,
        sector_name=payload.sector,
        name=payload.name,
        area_ha=payload.farm_size_ha,
        latitude=payload.latitude,
        longitude=payload.longitude,
        client_uuid=payload.client_uuid,
    )
    db.add(farm)
    db.flush()
    if payload.client_uuid:
        _link_pending_harvests(db, payload.client_uuid, farm.id)
    db.commit()
    db.refresh(farm)
    return _to_out(farm)


def _link_pending_harvests(db: DbSession, farm_client_uuid: str, farm_id) -> None:
    """Attach registrations that queued their farm first.

    Either upload can arrive before the other, so both routes link: this one
    for harvests already on the server, and ``create_harvest`` for farms that
    synced first.
    """
    (
        db.query(HarvestRegistration)
        .filter(
            HarvestRegistration.farm_client_uuid == farm_client_uuid,
            HarvestRegistration.farm_id.is_(None),
        )
        .update({HarvestRegistration.farm_id: farm_id}, synchronize_session=False)
    )
