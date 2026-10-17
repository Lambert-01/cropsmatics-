"""Farm profile upload (offline-first mobile sync, authenticated ownership).

The mobile queue uploads a farm profile *before* it marks the local outbox
entry synced, so this endpoint must be idempotent on the client-generated
``client_uuid``: a retry after a timeout returns the stored row instead of
creating a duplicate.

Ownership rules enforced here (they apply to create, lookup, replay and
linking alike):

* a bearer token is required; ``farmer_id`` is always the signed-in account's
  profile, never ``None``;
* a ``client_uuid`` that already exists under **another** account is refused
  with 409 - an idempotent replay only replays *your own* record;
* a repeat of the same ``client_uuid`` with a **different** payload is refused
  with 409 instead of silently acknowledging different data;
* the harvest back-link only attaches registrations owned by this same profile.

Concurrent duplicate uploads are settled by the unique index on
``farm.client_uuid`` inside a savepoint: the loser reloads the winning row and
goes through the same ownership/identity checks, so a select-then-insert race
cannot create two rows or hand one account another's record.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentFarmerProfile, DbSession
from app.models.farm import Farm
from app.models.harvest import HarvestRegistration
from app.repositories import dataset_repository as repo
from app.schemas.farm import FarmCreate, FarmOut

router = APIRouter(prefix="/farms", tags=["farm"])

#: A retry resends the same doubles; only a real change counts as a conflict.
_EPS = 1e-6


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

def _same_float(left: float | None, right: float | None) -> bool:
    if left is None or right is None:
        return left is None and right is None
    return abs(float(left) - float(right)) <= _EPS


def _same_record(existing: Farm, payload: FarmCreate) -> bool:
    """Whether a repeat upload describes the *same* intended profile.

    A replay with different content is a real conflict: acknowledging it would
    tell the client its data is stored when the server kept the other version.
    """

    def norm(value: str | None) -> str | None:
        return value or None

    return (
        existing.district_name == payload.district
        and norm(existing.sector_name) == norm(payload.sector)
        and norm(existing.name) == norm(payload.name)
        and _same_float(existing.area_ha, payload.farm_size_ha)
        and _same_float(existing.latitude, payload.latitude)
        and _same_float(existing.longitude, payload.longitude)
    )


def _replay(db: DbSession, existing: Farm, payload: FarmCreate, profile) -> FarmOut:
    """Serve a repeat of ``client_uuid`` under the owner's identity."""
    if existing.farmer_id != profile.id:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "client_uuid is already registered and does not belong to this account",
        )
    if not _same_record(existing, payload):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "client_uuid already describes a different farm profile",
        )
    _link_pending_harvests(db, profile, existing)
    db.commit()
    return _to_out(existing)


def _find_farm(db: DbSession, client_uuid: str) -> Farm | None:
    """Load by idempotency key. The single seam a lost insert race shows up at.

    The pre-check and the post-``IntegrityError`` recovery both go through this
    helper, so tests can emulate the stale read the race produces (the select
    returning ``None`` a moment before a concurrent upload commits) and prove
    recovery replays rather than duplicating.
    """
    return db.query(Farm).filter(Farm.client_uuid == client_uuid).one_or_none()


@router.post("", response_model=FarmOut, status_code=status.HTTP_201_CREATED)
def create_farm(payload: FarmCreate, db: DbSession, profile: CurrentFarmerProfile) -> FarmOut:
    _validate_district(payload.district)

    if payload.client_uuid:
        existing = _find_farm(db, payload.client_uuid)
        if existing:
            return _replay(db, existing, payload, profile)

    farm = Farm(
        farmer_id=profile.id,
        district_name=payload.district,
        sector_name=payload.sector,
        name=payload.name,
        area_ha=payload.farm_size_ha,
        latitude=payload.latitude,
        longitude=payload.longitude,
        client_uuid=payload.client_uuid,
    )
    try:
        with db.begin_nested():  # SAVEPOINT: a lost race keeps the session usable
            db.add(farm)  # inside the savepoint so its rollback expunges it
            db.flush()
    except IntegrityError as exc:
        # The unique index on client_uuid decided the winner. Re-loading the
        # winning row replays through the same ownership and identity checks.
        if farm in db:
            db.expunge(farm)
        winner = None
        if payload.client_uuid:
            winner = _find_farm(db, payload.client_uuid)
        if winner is None:
            # Not the idempotency key colliding: a genuine constraint failure,
            # surfaced rather than masked as success.
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "farm profile could not be stored"
            ) from exc
        return _replay(db, winner, payload, profile)

    if payload.client_uuid:
        _link_pending_harvests(db, profile, farm)
    db.commit()
    db.refresh(farm)
    return _to_out(farm)


def _link_pending_harvests(db: DbSession, profile, farm: Farm) -> None:
    """Attach *this account's* registrations that queued their farm first.

    Either upload can arrive before the other, so both routes link: this one
    for harvests already on the server, and ``create_harvest`` for farms that
    synced first. The owner filter is the safety property - a matching
    ``farm_client_uuid`` belonging to someone else is never relinked.
    """
    (
        db.query(HarvestRegistration)
        .filter(
            HarvestRegistration.farm_client_uuid == farm.client_uuid,
            HarvestRegistration.farmer_id == profile.id,
            HarvestRegistration.farm_id.is_(None),
        )
        .update({HarvestRegistration.farm_id: farm.id}, synchronize_session=False)
    )
