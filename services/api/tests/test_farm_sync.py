"""Offline sync: farm upload, harvest field record, and idempotent replay.

The suite runs without PostgreSQL (see ``conftest``), so these tests give the
request path a private SQLite database. Two details of that setup are load
bearing:

* the ``farm`` table carries a SpatiaLite geometry column, whose *compile-time*
  DDL and after-create hooks need SpatiaLite functions SQLite does not have -
  the table is therefore created from the compiled ``CREATE TABLE`` with the
  geometry type spelled plainly, and the column is always NULL here;
* uploads are idempotent on the client-generated UUID, which is what lets the
  mobile queue retry a timed-out POST without creating a duplicate row.
"""

from __future__ import annotations

import re

import pytest
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from sqlalchemy.schema import CreateIndex, CreateTable

from app.db.base import Base
from app.db.session import get_db
from app.models.farm import Farm
from app.models.harvest import HarvestRegistration

_TABLES = ("farm", "harvest_registration")

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


# --- farm upload --------------------------------------------------------------


def test_farm_upload_returns_a_stored_row(sync_client, sync_engine):
    res = sync_client.post("/api/v1/farms", json=_farm_payload())
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["client_uuid"] == "farm-1"
    assert body["district"] == "Bugesera"
    assert body["farm_size_ha"] == 1.25
    # The profile's coordinates are stored for the record and never returned.
    assert "latitude" not in body
    assert "longitude" not in body
    assert len(_rows(sync_engine, "farm")) == 1


def test_farm_upload_replays_the_stored_row_for_a_repeated_client_uuid(
    sync_client, sync_engine
):
    first = sync_client.post("/api/v1/farms", json=_farm_payload())
    second = sync_client.post("/api/v1/farms", json=_farm_payload())
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert len(_rows(sync_engine, "farm")) == 1


def test_farm_upload_rejects_an_unknown_district(sync_client, sync_engine):
    res = sync_client.post("/api/v1/farms", json=_farm_payload(district="Atlantis"))
    assert res.status_code == 422
    assert "Atlantis" in str(res.json()["detail"])
    assert len(_rows(sync_engine, "farm")) == 0


def test_farm_upload_rejects_out_of_range_coordinates(sync_client):
    res = sync_client.post("/api/v1/farms", json=_farm_payload(latitude=120.0))
    assert res.status_code == 422


# --- harvest field record -----------------------------------------------------


def test_harvest_create_persists_the_field_record(sync_client, sync_engine):
    res = sync_client.post("/api/v1/harvests", json=_harvest_payload())
    assert res.status_code == 201, res.text

    with Session(bind=sync_engine) as session:
        row = session.execute(
            select(HarvestRegistration).where(
                HarvestRegistration.client_uuid == "harvest-1"
            )
        ).scalar_one()
        assert row.harvest_start_date.isoformat() == "2026-09-01"
        assert row.harvest_end_date.isoformat() == "2026-09-14"
        assert row.notes == "planted after first rains"
        assert row.needs_storage_assistance is True
        assert row.latitude == pytest.approx(-2.05)
        assert row.longitude == pytest.approx(30.11)
        assert row.farm_client_uuid == "farm-1"
        assert row.is_offline_created is True
        assert row.sync_status == "SYNCED"


def test_harvest_replay_returns_the_stored_row(sync_client, sync_engine):
    first = sync_client.post("/api/v1/harvests", json=_harvest_payload())
    second = sync_client.post("/api/v1/harvests", json=_harvest_payload())
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert len(_rows(sync_engine, "harvest_registration")) == 1


def test_harvest_rejects_a_reversed_window(sync_client):
    res = sync_client.post(
        "/api/v1/harvests",
        json=_harvest_payload(harvest_start_date="2026-09-14", harvest_end_date="2026-09-01"),
    )
    assert res.status_code == 422
    assert "harvest_start_date" in str(res.json()["detail"])


def test_harvest_can_arrive_before_its_farm(sync_client, sync_engine):
    """No farm on the server yet is not an error; the link waits."""
    res = sync_client.post("/api/v1/harvests", json=_harvest_payload())
    assert res.status_code == 201, res.text
    with Session(bind=sync_engine) as session:
        row = session.execute(
            select(HarvestRegistration).where(
                HarvestRegistration.client_uuid == "harvest-1"
            )
        ).scalar_one()
        assert row.farm_id is None

    sync_client.post("/api/v1/farms", json=_farm_payload())

    with Session(bind=sync_engine) as session:
        row = session.execute(
            select(HarvestRegistration).where(
                HarvestRegistration.client_uuid == "harvest-1"
            )
        ).scalar_one()
        farm = session.execute(select(Farm).where(Farm.client_uuid == "farm-1")).scalar_one()
        assert row.farm_id == farm.id


def test_harvest_links_to_a_farm_that_synced_first(sync_client, sync_engine):
    sync_client.post("/api/v1/farms", json=_farm_payload())
    res = sync_client.post("/api/v1/harvests", json=_harvest_payload())
    assert res.status_code == 201, res.text
    with Session(bind=sync_engine) as session:
        row = session.execute(
            select(HarvestRegistration).where(
                HarvestRegistration.client_uuid == "harvest-1"
            )
        ).scalar_one()
        farm = session.execute(select(Farm).where(Farm.client_uuid == "farm-1")).scalar_one()
        assert row.farm_id == farm.id
