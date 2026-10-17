"""Offline sync under authenticated ownership: farms, harvests, scoped idempotency.

The suite runs without PostgreSQL (see ``conftest``), so these tests give the
request path a private SQLite database. Load-bearing details of that setup:

* the ``farm`` table carries a SpatiaLite geometry column, whose *compile-time*
  DDL and after-create hooks need SpatiaLite functions SQLite does not have - the
  table is therefore created from the compiled ``CREATE TABLE`` with the
  geometry type spelled plainly, and the column is always NULL here;
* uploads are idempotent on the client-generated UUID **scoped to the signed-in
  account**: a retry returns the stored row, another account's UUID is refused
  with 409, and a repeat carrying *different* data is refused instead of
  silently acknowledged;
* ownership lives on ``farmer_id`` (the account's ``FarmerProfile``); anonymous
  requests are rejected before any row is written.

The concurrent-duplicate tests emulate the one moment a real race produces - the
pre-insert select returning no row because a parallel request committed just
after it - by stubbing the lookup seam (``_find_farm`` / ``_find_harvest``)
while the database's unique constraint stays real. The loser must recover to the
winner's row through the same ownership and identity checks, not insert twice.
"""

from __future__ import annotations

import re
import uuid as uuid_lib
from datetime import UTC, date, datetime, timedelta

import pytest
from jose import jwt as jose_jwt
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from sqlalchemy.schema import CreateIndex, CreateTable

# Importing the model package populates Base.metadata with every table the
# fixtures below create (app_user, farmer_profile, risk_score included).
import app.models  # noqa: F401
from app.api.v1 import farms as farms_module
from app.api.v1 import harvests as harvests_module
from app.core.config import get_settings
from app.core.security import create_access_token, create_refresh_token
from app.db.base import Base
from app.db.session import get_db
from app.models.farm import Farm, FarmerProfile
from app.models.harvest import HarvestRegistration
from app.models.user import User  # noqa: F401  (registers app_user in metadata)

_TABLES = ("farm", "harvest_registration", "risk_score", "farmer_profile", "app_user")

#: SpatiaLite functions geoalchemy2 compiles into SELECTs and DDL. The stubs
#: are enough because ``location`` is always NULL in these tests: the geometry
#: result processor short-circuits on NULL before looking at the bytes.
_SPATIALITE_STUBS = (
    "AsEWKB",
    "AsBinary",
    "GeomFromEWKT",
    "GeomFromEWKB",
    "ST_AsBinary",
    "ST_GeomFromEWKB",
    "ST_GeomFromEWKT",
    "ST_GeomFromText",
    "ST_GeomFromWKB",
    "ST_SRID",
    "AddGeometryColumn",
    "RecoverGeometryColumn",
    "DiscardGeometryColumn",
    "SetSRID",
)


@pytest.fixture(scope="module")
def sync_engine():
    """An in-memory schema for just the tables the sync endpoints touch.

    ``CREATE TABLE`` is executed as compiled SQL instead of ``create_all`` so
    geoalchemy2's SpatiaLite after-create hooks never run; indexes still go
    through the normal DDL events (they need no spatial functions).
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _register_stubs(dbapi_connection, _record):
        def _passthrough(*args):
            return args[0] if args else None

        for name in _SPATIALITE_STUBS:
            dbapi_connection.create_function(name, -1, _passthrough)

    with engine.begin() as conn:
        for name in _TABLES:
            table = Base.metadata.tables[name]
            ddl = str(CreateTable(table).compile(dialect=engine.dialect))
            ddl = re.sub(r"geometry\([^)]*\)", "GEOMETRY", ddl, flags=re.I)
            conn.exec_driver_sql(ddl)
            for index in table.indexes:
                conn.exec_driver_sql(str(CreateIndex(index).compile(dialect=engine.dialect)))
    yield engine
    engine.dispose()


@pytest.fixture
def sync_client(client, sync_engine):
    """The shared app, with the DB dependency served from the SQLite schema."""

    def _session():
        session = Session(bind=sync_engine, autoflush=False, expire_on_commit=False)
        try:
            yield session
        finally:
            session.close()

    client.app.dependency_overrides[get_db] = _session
    yield client
    client.app.dependency_overrides.pop(get_db, None)
    with sync_engine.begin() as conn:
        for name in _TABLES:
            conn.execute(text(f"DELETE FROM {name}"))


def _auth(user_id: str | None = None) -> tuple[str, dict[str, str]]:
    """A signed-in account: ``(user id, bearer headers)``."""
    uid = user_id or str(uuid_lib.uuid4())
    token = create_access_token(uid, extra={"roles": ["farmer"]})
    return uid, {"Authorization": f"Bearer {token}"}


def _make_profile(sync_engine, user_id: str) -> FarmerProfile:
    """Pre-create an account's profile so its id is known to the test."""
    profile = FarmerProfile(id=uuid_lib.uuid4(), user_id=uuid_lib.UUID(user_id))
    with Session(bind=sync_engine, expire_on_commit=False) as session:
        session.add(profile)
        session.commit()
    return profile


def _profile_for(sync_engine, user_id: str) -> FarmerProfile:
    """The profile row a signed-in account's uploads are owned by."""
    with Session(bind=sync_engine, expire_on_commit=False) as session:
        return session.execute(
            select(FarmerProfile).where(FarmerProfile.user_id == uuid_lib.UUID(user_id))
        ).scalar_one()


def _farm_payload(**overrides) -> dict:
    payload = {
        "client_uuid": "farm-1",
        "name": "Mugisha farm",
        "district": "Bugesera",
        "sector": "Rwamagana",
        "farm_size_ha": 1.25,
        "latitude": -2.05,
        "longitude": 30.11,
    }
    payload.update(overrides)
    return payload


def _harvest_payload(**overrides) -> dict:
    payload = {
        "client_uuid": "harvest-1",
        "district": "Bugesera",
        "crop": "Maize",
        "expected_quantity_kg": 400.0,
        "harvest_start_date": "2026-09-01",
        "harvest_end_date": "2026-09-14",
        "expected_harvest_date": "2026-09-10",
        "latitude": -2.05,
        "longitude": 30.11,
        "notes": "planted after first rains",
        "needs_storage_assistance": True,
        "farm_client_uuid": "farm-1",
    }
    payload.update(overrides)
    return payload


def _rows(sync_engine, table: str) -> list:
    with Session(bind=sync_engine) as session:
        return list(session.execute(select(Base.metadata.tables[table])).all())


def _farm_row(sync_engine, client_uuid: str):
    with Session(bind=sync_engine) as session:
        return session.execute(
            select(Farm).where(Farm.client_uuid == client_uuid)
        ).scalar_one_or_none()


def _harvest_row(sync_engine, client_uuid: str) -> HarvestRegistration | None:
    with Session(bind=sync_engine) as session:
        return session.execute(
            select(HarvestRegistration).where(
                HarvestRegistration.client_uuid == client_uuid
            )
        ).scalar_one_or_none()


# --- authentication -----------------------------------------------------------

def test_anonymous_farm_upload_is_rejected(sync_client, sync_engine):
    res = sync_client.post("/api/v1/farms", json=_farm_payload())
    assert res.status_code == 401, res.text
    assert len(_rows(sync_engine, "farm")) == 0


def test_anonymous_harvest_create_and_read_are_rejected(sync_client, sync_engine):
    created = sync_client.post("/api/v1/harvests", json=_harvest_payload())
    assert created.status_code == 401, created.text
    read = sync_client.get("/api/v1/harvests/00000000-0000-0000-0000-000000000000")
    assert read.status_code == 401
    assert len(_rows(sync_engine, "harvest_registration")) == 0


def test_expired_credentials_are_rejected(sync_client, sync_engine):
    settings = get_settings()
    expired = jose_jwt.encode(
        {
            "sub": str(uuid_lib.uuid4()),
            "type": "access",
            "iat": int((datetime.now(UTC) - timedelta(hours=2)).timestamp()),
            "exp": int((datetime.now(UTC) - timedelta(minutes=5)).timestamp()),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    res = sync_client.post(
        "/api/v1/farms",
        json=_farm_payload(),
        headers={"Authorization": f"Bearer {expired}"},
    )
    assert res.status_code == 401
    assert len(_rows(sync_engine, "farm")) == 0


def test_a_refresh_token_is_not_a_bearer_credential(sync_client, sync_engine):
    uid = str(uuid_lib.uuid4())
    refresh = create_refresh_token(uid)
    res = sync_client.post(
        "/api/v1/farms",
        json=_farm_payload(),
        headers={"Authorization": f"Bearer {refresh}"},
    )
    assert res.status_code == 401
    assert len(_rows(sync_engine, "farm")) == 0


# --- farm upload --------------------------------------------------------------

def test_farm_upload_returns_a_stored_row(sync_client, sync_engine):
    _uid, headers = _auth()
    res = sync_client.post("/api/v1/farms", json=_farm_payload(), headers=headers)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["client_uuid"] == "farm-1"
    assert body["district"] == "Bugesera"
    assert body["farm_size_ha"] == 1.25
    # The profile's coordinates are stored for the record and never returned.
    assert "latitude" not in body
    assert "longitude" not in body
    assert len(_rows(sync_engine, "farm")) == 1

    # The stored row is owned by the signed-in account, not anonymous.
    with Session(bind=sync_engine) as session:
        row = session.execute(
            select(Farm).where(Farm.client_uuid == "farm-1")
        ).scalar_one()
        assert row.farmer_id is not None


def test_farm_upload_replays_the_stored_row_for_a_repeated_client_uuid(
    sync_client, sync_engine
):
    _uid, headers = _auth()
    first = sync_client.post("/api/v1/farms", json=_farm_payload(), headers=headers)
    second = sync_client.post("/api/v1/farms", json=_farm_payload(), headers=headers)
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert len(_rows(sync_engine, "farm")) == 1


def test_concurrent_duplicate_farm_upload_replays_the_winner(
    sync_client, sync_engine, monkeypatch
):
    """A lost insert race recovers to the winner's row instead of failing.

    The pre-insert select sees nothing (a parallel request committed just
    after it), the unique index rejects the insert, and the recovery lookup
    finds the winner - which still has to pass the ownership and same-record
    checks before it is acknowledged.
    """
    uid, headers = _auth()
    profile = _make_profile(sync_engine, uid)
    winner = Farm(
        id=uuid_lib.uuid4(),
        farmer_id=profile.id,
        district_name="Bugesera",
        sector_name="Rwamagana",
        name="Mugisha farm",
        area_ha=1.25,
        latitude=-2.05,
        longitude=30.11,
        client_uuid="farm-race",
    )
    winner_id = winner.id
    with Session(bind=sync_engine) as session:
        session.add(winner)
        session.commit()

    real = farms_module._find_farm
    calls = {"n": 0}

    def stale_first_read(db, client_uuid):
        calls["n"] += 1
        if calls["n"] == 1:
            return None  # our select ran before the concurrent commit landed
        return real(db, client_uuid)

    monkeypatch.setattr(farms_module, "_find_farm", stale_first_read)

    res = sync_client.post(
        "/api/v1/farms", json=_farm_payload(client_uuid="farm-race"), headers=headers
    )
    assert res.status_code == 201, res.text
    assert res.json()["id"] == str(winner_id)
    with Session(bind=sync_engine) as session:
        rows = session.execute(
            select(Farm).where(Farm.client_uuid == "farm-race")
        ).scalars().all()
    assert len(rows) == 1
    assert rows[0].farmer_id == profile.id


def test_a_lost_race_against_another_accounts_record_is_refused(
    sync_client, sync_engine, monkeypatch
):
    uid_b, _headers_b = _auth()
    profile_b = _make_profile(sync_engine, uid_b)
    winner = Farm(
        id=uuid_lib.uuid4(),
        farmer_id=profile_b.id,
        district_name="Bugesera",
        sector_name="Rwamagana",
        name="Mugisha farm",
        area_ha=1.25,
        latitude=-2.05,
        longitude=30.11,
        client_uuid="farm-race-b",
    )
    with Session(bind=sync_engine) as session:
        session.add(winner)
        session.commit()

    real = farms_module._find_farm
    calls = {"n": 0}

    def stale_first_read(db, client_uuid):
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return real(db, client_uuid)

    monkeypatch.setattr(farms_module, "_find_farm", stale_first_read)

    _uid, headers_a = _auth()
    res = sync_client.post(
        "/api/v1/farms", json=_farm_payload(client_uuid="farm-race-b"), headers=headers_a
    )
    assert res.status_code == 409, res.text
    with Session(bind=sync_engine) as session:
        row = session.execute(
            select(Farm).where(Farm.client_uuid == "farm-race-b")
        ).scalar_one()
        assert row.farmer_id == profile_b.id


def test_farm_upload_rejects_an_unknown_district(sync_client, sync_engine):
    _uid, headers = _auth()
    res = sync_client.post(
        "/api/v1/farms", json=_farm_payload(district="Atlantis"), headers=headers
    )
    assert res.status_code == 422
    assert "Atlantis" in str(res.json()["detail"])
    assert len(_rows(sync_engine, "farm")) == 0


def test_farm_upload_rejects_out_of_range_coordinates(sync_client):
    _uid, headers = _auth()
    res = sync_client.post(
        "/api/v1/farms", json=_farm_payload(latitude=120.0), headers=headers
    )
    assert res.status_code == 422


def test_farm_upload_rejects_unknown_fields(sync_client, sync_engine):
    """Extra fields are refused, never silently dropped from the stored record."""
    _uid, headers = _auth()
    res = sync_client.post(
        "/api/v1/farms", json=_farm_payload(photo="field.jpg"), headers=headers
    )
    assert res.status_code == 422
    assert "photo" in str(res.json()["detail"])
    assert len(_rows(sync_engine, "farm")) == 0


def test_conflicting_farm_payload_is_refused(sync_client, sync_engine):
    """A replay carrying *different* data gets 409, not a quiet 201."""
    _uid, headers = _auth()
    first = sync_client.post("/api/v1/farms", json=_farm_payload(), headers=headers)
    assert first.status_code == 201
    changed = sync_client.post(
        "/api/v1/farms", json=_farm_payload(farm_size_ha=9.5), headers=headers
    )
    assert changed.status_code == 409
    assert "different farm profile" in str(changed.json()["detail"])
    row = _farm_row(sync_engine, "farm-1")
    assert row is not None and row.area_ha == pytest.approx(1.25)


# --- cross-account isolation ---------------------------------------------------

def test_another_account_cannot_replay_my_farm_uuid(sync_client, sync_engine):
    uid_a, headers_a = _auth()
    _uid_b, headers_b = _auth()
    first = sync_client.post("/api/v1/farms", json=_farm_payload(), headers=headers_a)
    assert first.status_code == 201

    res = sync_client.post("/api/v1/farms", json=_farm_payload(), headers=headers_b)
    assert res.status_code == 409, res.text
    assert "does not belong to this account" in str(res.json()["detail"])
    # Exactly one row, still owned by account A.
    assert len(_rows(sync_engine, "farm")) == 1
    row = _farm_row(sync_engine, "farm-1")
    assert row is not None
    owner_a = _profile_for(sync_engine, uid_a)
    assert row.farmer_id == owner_a.id


def test_accounts_cannot_read_each_others_harvests(sync_client, sync_engine):
    _uid_a, headers_a = _auth()
    _uid_b, headers_b = _auth()
    created = sync_client.post(
        "/api/v1/harvests", json=_harvest_payload(), headers=headers_a
    )
    assert created.status_code == 201, created.text
    harvest_id = created.json()["id"]

    own = sync_client.get(f"/api/v1/harvests/{harvest_id}", headers=headers_a)
    assert own.status_code == 200

    other_read = sync_client.get(f"/api/v1/harvests/{harvest_id}", headers=headers_b)
    assert other_read.status_code == 404  # existence is not leaked

    other_risk = sync_client.post(
        f"/api/v1/harvests/{harvest_id}/risk", headers=headers_b
    )
    assert other_risk.status_code == 404

    own_risk = sync_client.post(
        f"/api/v1/harvests/{harvest_id}/risk", headers=headers_a
    )
    assert own_risk.status_code == 200, own_risk.text
    assert len(_rows(sync_engine, "risk_score")) == 1


def test_registration_cannot_reference_another_accounts_farm(sync_client, sync_engine):
    _uid_a, headers_a = _auth()
    _uid_b, headers_b = _auth()
    farm = sync_client.post("/api/v1/farms", json=_farm_payload(), headers=headers_a)
    assert farm.status_code == 201

    res = sync_client.post(
        "/api/v1/harvests", json=_harvest_payload(), headers=headers_b
    )
    assert res.status_code == 409, res.text
    assert "farm_client_uuid" in str(res.json()["detail"])
    assert len(_rows(sync_engine, "harvest_registration")) == 0


def test_a_harvest_uuid_replay_from_another_account_is_refused(
    sync_client, sync_engine
):
    _uid_a, headers_a = _auth()
    _uid_b, headers_b = _auth()
    first = sync_client.post(
        "/api/v1/harvests", json=_harvest_payload(), headers=headers_a
    )
    assert first.status_code == 201
    res = sync_client.post(
        "/api/v1/harvests", json=_harvest_payload(), headers=headers_b
    )
    assert res.status_code == 409
    assert len(_rows(sync_engine, "harvest_registration")) == 1


def test_the_farm_back_link_only_attaches_my_own_registrations(
    sync_client, sync_engine
):
    """A shared farm_client_uuid never relinks someone else's registration."""
    _uid_a, headers_a = _auth()
    _uid_b, headers_b = _auth()
    mine = sync_client.post(
        "/api/v1/harvests",
        json=_harvest_payload(client_uuid="harvest-mine", farm_client_uuid="farm-shared"),
        headers=headers_a,
    )
    theirs = sync_client.post(
        "/api/v1/harvests",
        json=_harvest_payload(client_uuid="harvest-theirs", farm_client_uuid="farm-shared"),
        headers=headers_b,
    )
    assert mine.status_code == 201 and theirs.status_code == 201

    farm = sync_client.post(
        "/api/v1/farms", json=_farm_payload(client_uuid="farm-shared"), headers=headers_a
    )
    assert farm.status_code == 201, farm.text

    linked_mine = _harvest_row(sync_engine, "harvest-mine")
    linked_theirs = _harvest_row(sync_engine, "harvest-theirs")
    assert linked_mine is not None and linked_mine.farm_id is not None
    # Account B's registration stays unlinked: its farm id is not ours to claim.
    assert linked_theirs is not None and linked_theirs.farm_id is None

    # And B cannot subsequently upload a farm under A's client_uuid.
    res = sync_client.post(
        "/api/v1/farms", json=_farm_payload(client_uuid="farm-shared"), headers=headers_b
    )
    assert res.status_code == 409


# --- harvest field record -----------------------------------------------------

def test_harvest_create_persists_the_field_record(sync_client, sync_engine):
    _uid, headers = _auth()
    res = sync_client.post("/api/v1/harvests", json=_harvest_payload(), headers=headers)
    assert res.status_code == 201, res.text

    row = _harvest_row(sync_engine, "harvest-1")
    assert row is not None
    assert row.harvest_start_date.isoformat() == "2026-09-01"
    assert row.harvest_end_date.isoformat() == "2026-09-14"
    assert row.notes == "planted after first rains"
    assert row.needs_storage_assistance is True
    assert row.latitude == pytest.approx(-2.05)
    assert row.longitude == pytest.approx(30.11)
    assert row.farm_client_uuid == "farm-1"
    assert row.is_offline_created is True
    assert row.sync_status == "SYNCED"
    assert row.farmer_id is not None  # owned, not anonymous


def test_harvest_replay_returns_the_stored_row(sync_client, sync_engine):
    _uid, headers = _auth()
    first = sync_client.post("/api/v1/harvests", json=_harvest_payload(), headers=headers)
    second = sync_client.post("/api/v1/harvests", json=_harvest_payload(), headers=headers)
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert len(_rows(sync_engine, "harvest_registration")) == 1


def test_concurrent_duplicate_harvest_upload_replays_the_winner(
    sync_client, sync_engine, monkeypatch
):
    uid, headers = _auth()
    profile = _make_profile(sync_engine, uid)
    winner = HarvestRegistration(
        id=uuid_lib.uuid4(),
        farmer_id=profile.id,
        district_name="Bugesera",
        crop_name="Maize",
        expected_harvest_date=date(2026, 9, 10),
        harvest_start_date=date(2026, 9, 1),
        harvest_end_date=date(2026, 9, 14),
        expected_quantity_kg=400.0,
        latitude=-2.05,
        longitude=30.11,
        notes="planted after first rains",
        needs_storage_assistance=True,
        client_uuid="harvest-race",
        farm_client_uuid="farm-1",
        sync_status="SYNCED",
        source_id="MOBILE_OPERATIONAL",
        source_period="operational",
    )
    winner_id = winner.id
    with Session(bind=sync_engine) as session:
        session.add(winner)
        session.commit()

    real = harvests_module._find_harvest
    calls = {"n": 0}

    def stale_first_read(db, client_uuid):
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return real(db, client_uuid)

    monkeypatch.setattr(harvests_module, "_find_harvest", stale_first_read)

    res = sync_client.post(
        "/api/v1/harvests", json=_harvest_payload(client_uuid="harvest-race"), headers=headers
    )
    assert res.status_code == 201, res.text
    assert res.json()["id"] == str(winner_id)
    assert len(_rows(sync_engine, "harvest_registration")) == 1


def test_harvest_rejects_a_reversed_window(sync_client):
    _uid, headers = _auth()
    res = sync_client.post(
        "/api/v1/harvests",
        json=_harvest_payload(harvest_start_date="2026-09-14", harvest_end_date="2026-09-01"),
        headers=headers,
    )
    assert res.status_code == 422
    assert "harvest_start_date" in str(res.json()["detail"])


def test_harvest_rejects_unknown_fields(sync_client, sync_engine):
    _uid, headers = _auth()
    res = sync_client.post(
        "/api/v1/harvests", json=_harvest_payload(unexpected="value"), headers=headers
    )
    assert res.status_code == 422
    assert "unexpected" in str(res.json()["detail"])
    assert len(_rows(sync_engine, "harvest_registration")) == 0


def test_conflicting_harvest_payload_is_refused(sync_client, sync_engine):
    _uid, headers = _auth()
    first = sync_client.post("/api/v1/harvests", json=_harvest_payload(), headers=headers)
    assert first.status_code == 201
    changed = sync_client.post(
        "/api/v1/harvests",
        json=_harvest_payload(expected_quantity_kg=900.0),
        headers=headers,
    )
    assert changed.status_code == 409
    row = _harvest_row(sync_engine, "harvest-1")
    assert row is not None and row.expected_quantity_kg == pytest.approx(400.0)


def test_harvest_can_arrive_before_its_farm(sync_client, sync_engine):
    """No farm on the server yet is not an error; the link waits."""
    _uid, headers = _auth()
    res = sync_client.post("/api/v1/harvests", json=_harvest_payload(), headers=headers)
    assert res.status_code == 201, res.text
    row = _harvest_row(sync_engine, "harvest-1")
    assert row is not None and row.farm_id is None

    sync_client.post("/api/v1/farms", json=_farm_payload(), headers=headers)

    row = _harvest_row(sync_engine, "harvest-1")
    farm = _farm_row(sync_engine, "farm-1")
    assert row is not None and farm is not None
    assert row.farm_id == farm.id


def test_harvest_links_to_a_farm_that_synced_first(sync_client, sync_engine):
    _uid, headers = _auth()
    sync_client.post("/api/v1/farms", json=_farm_payload(), headers=headers)
    res = sync_client.post("/api/v1/harvests", json=_harvest_payload(), headers=headers)
    assert res.status_code == 201, res.text
    row = _harvest_row(sync_engine, "harvest-1")
    farm = _farm_row(sync_engine, "farm-1")
    assert row is not None and farm is not None
    assert row.farm_id == farm.id
