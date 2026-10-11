"""Row-shape regression tests for the canonical repository.

The production incident: ``/api/v1/data/version`` returned HTTP 500 with
``AttributeError: 'str' object has no attribute 'version'`` whenever the
database was actually serving. On a Core connection (no ORM session),
``connection.execute(select(Model))`` yields rows of *raw column values*, not
model instances, so ``scalar_one_or_none()`` returned the first column - the
version string - and attribute access raised.

The hermetic unit suite could not catch it: its DATABASE_URL points at an
unreachable port, so every canonical read short-circuits through the
"unavailable" probe and the projection code never runs. These tests exercise
the projection itself against an in-memory database, so the failure mode is
covered without a PostgreSQL server.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.db.base import Base
from app.models.canonical import DatasetVersion, Indicator, Unit

# Only the tables these reads touch. A blanket create_all would pull in the
# GIS tables, which need Spatialite functions SQLite does not provide.
_TABLES = (
    Base.metadata.tables["dataset_version"],
    Base.metadata.tables["indicator"],
    Base.metadata.tables["unit"],
    # probe()/entity_counts() require these to exist to report "ready".
    Base.metadata.tables["period"],
    Base.metadata.tables["crop_productivity"],
    Base.metadata.tables["agricultural_observation"],
    Base.metadata.tables["source_table"],
    Base.metadata.tables["data_source"],
)


@pytest.fixture()
def memory_engine():
    """In-memory schema with the canonical tables the reads touch."""
    # check_same_thread + StaticPool: FastAPI runs sync endpoints in a worker
    # thread, and an in-memory database only exists on the connection it was
    # created with, so every thread must share that one connection.
    from sqlalchemy.pool import StaticPool

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine, tables=list(_TABLES))
    yield engine
    engine.dispose()


@pytest.fixture()
def canonical(memory_engine, monkeypatch):
    """The repository wired to the in-memory engine, exactly as production wires it."""
    from app.repositories import canonical_repository

    monkeypatch.setattr(
        "app.db.session.engine",
        memory_engine,
    )
    return canonical_repository


def _insert_version(engine, **overrides) -> None:
    from app.db.base import utcnow

    fields = {
        "version": "0.2.0-abc123",
        "pipeline_version": "0.2.0",
        "git_sha": "c" * 40,
        "build_timestamp": "2026-10-03T10:05:14+00:00",
        "source_hash": "d" * 64,
        "transformation_version": "0.2.0",
        "row_counts": {"crop_productivity": 10},
        "validation": {"status": "passed"},
        "loaded_at": utcnow(),
    }
    fields.update(overrides)
    with sessionmaker(bind=engine)() as session:
        session.add(DatasetVersion(**fields))
        session.commit()


def test_current_version_returns_a_dict_not_a_string(memory_engine, canonical):
    """The incident itself: the version row must project onto a dict."""
    _insert_version(memory_engine)
    result = canonical.current_version()
    assert isinstance(result, dict)
    assert result["version"] == "0.2.0-abc123"
    assert result["row_counts"] == {"crop_productivity": 10}
    assert result["validation"] == {"status": "passed"}
    assert result["loaded_at"] is not None


def test_current_version_on_an_empty_table_is_none(memory_engine, canonical):
    assert canonical.current_version() is None


def test_current_version_picks_the_most_recently_loaded_release(memory_engine, canonical):
    """Multiple versions: the latest loaded_at wins, not insertion order."""
    from datetime import timedelta

    from app.db.base import utcnow

    _insert_version(memory_engine, version="old", loaded_at=utcnow() - timedelta(days=30))
    _insert_version(memory_engine, version="new", loaded_at=utcnow())
    assert canonical.current_version()["version"] == "new"


def test_current_version_tolerates_a_null_loaded_at(memory_engine, canonical):
    """A malformed/partial record must not crash the endpoint."""
    _insert_version(memory_engine, loaded_at=None, row_counts=None, validation=None)
    result = canonical.current_version()
    assert result["version"] == "0.2.0-abc123"
    assert result["row_counts"] == {}
    assert result["validation"] == {}
    assert result["loaded_at"] is None


def test_indicator_rows_return_dicts_with_resolved_fields(memory_engine, canonical):
    """`.scalars()` on a Core connection yields strings, not instances.

    indicator_rows() had the same defect as current_version(): the endpoint
    crashed only when a real database was serving.
    """

    with sessionmaker(bind=memory_engine)() as session:
        session.add(Unit(unit_code="kg_ha", name="Kilograms per hectare", dimension="mass"))
        session.add(
            Indicator(
                indicator_code="yield_kg_ha",
                name="Harvest per hectare",
                description=None,
                unit_code="kg_ha",
                domain="productivity",
                geographic_levels="district,national",
                has_crop_dimension=True,
            )
        )
        session.commit()

    rows = canonical.indicator_rows()
    assert rows == [
        {
            "indicator_code": "yield_kg_ha",
            "name": "Harvest per hectare",
            "description": None,
            "unit_code": "kg_ha",
            "domain": "productivity",
            "geographic_levels": ["district", "national"],
            "has_crop_dimension": True,
        }
    ]


def test_version_endpoint_serves_postgres_shape_end_to_end(memory_engine, canonical, client):
    """The full request path with a serving database: 200, source=postgres.

    Before the fix this raised AttributeError inside the service and the
    endpoint returned 500 - but only with a reachable database, which is why
    the hermetic suite never saw it.
    """
    from app.models.canonical import CropProductivity, Period
    from app.models.ops import DataSource

    _insert_version(memory_engine)
    with sessionmaker(bind=memory_engine)() as session:
        session.add(
            Period(
                period_id="2026B",
                year=2026,
                season="B",
                label="2026 Season B",
                sort_key="2026B",
                has_district_coverage=True,
                has_national_coverage=True,
            )
        )
        session.add(DataSource(source_id="SRC-TEST", owner="test"))
        session.add(
            CropProductivity(
                period_id="2026B",
                year=2026,
                season="B",
                geography_level="national",
                geography_code="RW",
                crop_code="CROP-MAI",
                crop_name="Maize",
                farmer_scale="all",
                source_id="SRC-TEST",
                dataset_version="0.2.0-abc123",
                is_synthetic=False,
            )
        )
        session.commit()

    response = client.get("/api/v1/data/version")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "postgres"
    assert body["data"]["version"] == "0.2.0-abc123"
    assert body["data"]["canonical"] == {"availability": "ready", "reason": None}


def test_a_core_connection_returns_column_values_not_instances(memory_engine):
    """Documents the SQLAlchemy behaviour the bug came from.

    This is the invariant that made ``scalar_one_or_none()`` return a string:
    on a plain Connection, ``select(Entity)`` selects the entity's *columns*.
    If a future SQLAlchemy changes this, the two fixes stay valid but this test
    explains why they were needed.
    """
    _insert_version(memory_engine)
    with memory_engine.connect() as connection:
        row = connection.execute(
            select(DatasetVersion).limit(1)
        ).scalar_one_or_none()
    assert isinstance(row, str), "expected the first column value (the version string)"
