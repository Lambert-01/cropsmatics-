"""End-to-end canonical database tests against a real PostgreSQL.

These are the only tests that exercise the migrations, the loader, and the
canonical query path for real, so they are the ones that prove the pipeline's
definition of done rather than approximating it offline.

They **skip by default**. No CI run and no developer machine should be able to
reach a production database by accident, so a test database must be named
explicitly:

    CANONICAL_TEST_DATABASE_URL=postgresql+psycopg://user:pw@host/db \
        pytest services/api/tests/test_canonical_integration.py -q

Use a throwaway database. The fixture applies migrations and loads the pipeline
output; it does not drop anything, but it does write.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

API_DIR = Path(__file__).resolve().parents[1]

TEST_URL = os.environ.get("CANONICAL_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_URL,
    reason=(
        "set CANONICAL_TEST_DATABASE_URL to a throwaway database to run the "
        "canonical integration tests"
    ),
)


@pytest.fixture(scope="module")
def database_url() -> str:
    assert TEST_URL
    return TEST_URL


@pytest.fixture(scope="module")
def engine(database_url):
    from sqlalchemy import create_engine

    return create_engine(database_url, future=True)


@pytest.fixture(scope="module")
def migrated(engine, database_url) -> bool:
    """Apply the migration chain to the test database."""
    from alembic import command
    from alembic.config import Config

    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")
    return True


@pytest.fixture(scope="module")
def loader(database_url):
    """The loader's `main`, so it runs in-process with an explicit URL."""

    def _run(*extra: str) -> int:
        from scripts.data.load_postgres import main as load_main

        return load_main(["--url", database_url, *extra])

    return _run


@pytest.fixture(scope="module")
def loaded(migrated, loader) -> int:
    return loader()


def _scalar(engine, sql: str) -> int:
    from sqlalchemy import text

    with engine.connect() as connection:
        return int(connection.execute(text(sql)).scalar() or 0)


def test_migrations_create_every_canonical_table(engine, migrated):
    from sqlalchemy import inspect

    tables = set(inspect(engine).get_table_names())
    for name in (
        "period",
        "unit",
        "indicator",
        "source_table",
        "dataset_version",
        "data_ingestion_run",
        "crop_productivity",
        "agricultural_observation",
    ):
        assert name in tables, f"{name} was not created by the migration"


def test_the_loader_succeeds_and_rejects_nothing(loaded):
    """A non-zero exit means rows were dropped; the canonical tables would be
    silently incomplete, so it must be zero."""
    assert loaded == 0


def test_the_panel_is_loaded_in_full(engine, loaded):
    """Every processed panel row must reach the table — none silently dropped."""
    import pandas as pd

    processed = pd.read_csv(REPO_ROOT / "data" / "processed" / "crop_productivity.csv")
    assert _scalar(engine, "SELECT count(*) FROM crop_productivity") == len(processed)


def test_periods_cover_every_published_release(engine, loaded):
    with engine.connect() as connection:
        from sqlalchemy import text

        periods = {
            row[0] for row in connection.execute(text("SELECT DISTINCT period_id FROM crop_productivity"))
        }
    assert periods == {
        "2024A", "2024B", "2024C", "2025A", "2025B", "2025C", "2026A", "2026B"
    }


def test_reloading_is_idempotent(engine, loaded, loader):
    """Running the loader twice must change nothing and report rows unchanged."""
    before = _scalar(engine, "SELECT count(*) FROM crop_productivity")
    assert loader() == 0
    after = _scalar(engine, "SELECT count(*) FROM crop_productivity")
    assert after == before, "a second load duplicated rows"

    from sqlalchemy import text

    with engine.connect() as connection:
        unchanged = connection.execute(
            text(
                "SELECT unchanged_rows FROM data_ingestion_run "
                "WHERE target_table = 'crop_productivity' ORDER BY created_at DESC LIMIT 1"
            )
        ).scalar()
    assert unchanged and int(unchanged) > 0


def test_a_dry_run_writes_nothing(engine, loaded, loader):
    before = _scalar(engine, "SELECT count(*) FROM data_ingestion_run")
    assert loader("--dry-run") == 0
    assert _scalar(engine, "SELECT count(*) FROM data_ingestion_run") == before


def test_crop_varieties_are_stored_separately(engine, loaded):
    """Three published banana varieties must remain three observations."""
    from sqlalchemy import text

    with engine.connect() as connection:
        variants = {
            row[0]
            for row in connection.execute(
                text(
                    "SELECT DISTINCT crop_variant FROM agricultural_observation "
                    "WHERE crop_code = 'CROP-BAN' AND indicator_code = 'sold_pct'"
                )
            )
        }
    assert variants == {"Cooking banana", "Dessert banana", "Banana for beer"}


def test_sample_query_matches_the_processed_output(engine, loaded):
    """2026B x Maize at district level must match what the pipeline produced."""
    import pandas as pd

    panel = pd.read_csv(REPO_ROOT / "data" / "processed" / "crop_productivity.csv")
    expected = panel[
        (panel["period_code"] == "2026B")
        & (panel["crop_code"] == "CROP-MAI")
        & (panel["geography_level"] == "DISTRICT")
        & (panel["farmer_scale"] == "all")
    ]
    from sqlalchemy import text

    with engine.connect() as connection:
        actual = connection.execute(
            text(
                "SELECT count(*), count(DISTINCT district_code) FROM crop_productivity "
                "WHERE period_id = '2026B' AND crop_code = 'CROP-MAI' "
                "AND geography_level = 'district' AND farmer_scale = 'all'"
            )
        ).one()
    assert actual[0] == len(expected)
    assert actual[1] == expected["district_code"].nunique()


def test_no_synthetic_row_reaches_the_canonical_tables(engine, loaded):
    assert _scalar(engine, "SELECT count(*) FROM crop_productivity WHERE is_synthetic") == 0
    assert _scalar(engine, "SELECT count(*) FROM agricultural_observation WHERE is_synthetic") == 0


def test_negative_metrics_are_refused_by_the_database(engine, loaded):
    """The constraint is the last line of defence, whatever wrote the row."""
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO crop_productivity "
                    "(id, period_id, year, season, geography_level, geography_code, crop_code, "
                    " crop_name, farmer_scale, production_mt, source_id, "
                    " dataset_version, quality_flag, is_synthetic, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), '2026B', 2026, 'B', 'district', 'RW-EA-BUG', "
                    " 'CROP-MAI', 'Maize', 'all', -1, "
                    " (SELECT source_id FROM data_source LIMIT 1), "
                    " (SELECT version FROM dataset_version LIMIT 1), 'ok', false, now(), now())"
                )
            )


@pytest.fixture()
def app_engine(engine, monkeypatch):
    """Point the application's session layer at the test database.

    The API's own engine is bound at import time to whatever ``DATABASE_URL``
    held; the integration tests drive their own throwaway database, so the
    application modules are re-pointed here rather than re-imported.
    """
    from sqlalchemy.orm import sessionmaker

    import app.db.session as session_module

    monkeypatch.setattr(session_module, "engine", engine)
    monkeypatch.setattr(
        session_module,
        "SessionLocal",
        sessionmaker(bind=engine, autoflush=False, expire_on_commit=False),
    )
    return engine


def _norm(series):
    """Normalise a column so NaN and None compare alike across layers."""
    return series.astype(object).where(series.notna(), None).tolist()


def test_canonical_read_matches_the_processed_panel(loaded, app_engine):
    """The canonical read must reproduce the processed panel exactly.

    This is the parity guarantee that makes the database authoritative: for a
    representative slice, the DB-served frame equals the CSV-served frame column
    for column, including NULLs.
    """
    import pandas as pd

    from app.repositories import canonical_repository as canonical

    csv = pd.read_csv(REPO_ROOT / "data" / "processed" / "crop_productivity.csv")
    expected = csv[
        (csv["period_code"] == "2026B")
        & (csv["crop_code"] == "CROP-MAI")
        & (csv["geography_level"] == "DISTRICT")
        & (csv["farmer_scale"] == "all")
    ].sort_values("district_code")

    frame = canonical.productivity_frame(
        period_id="2026B",
        geography_level="DISTRICT",
        crop_code="CROP-MAI",
        farmer_scale="all",
    ).sort_values("district_code")

    assert len(frame) == len(expected)
    for column in (
        "district",
        "district_code",
        "province",
        "agro_ecological_zone",
        "canonical_crop_name",
        "cultivated_area_ha",
        "harvested_area_ha",
        "production_mt",
        "yield_kg_ha",
        "source_id",
        "source_sheets",
    ):
        assert _norm(frame[column]) == _norm(expected[column]), column


def test_canonical_read_marks_geography_levels_like_the_panel(loaded, app_engine):
    """Consumers compare against uppercase levels, so the projection must too."""
    from app.repositories import canonical_repository as canonical

    frame = canonical.productivity_frame(period_id="2026B", geography_level="NATIONAL")
    assert not frame.empty
    assert set(frame["geography_level"]) == {"NATIONAL"}


def test_processed_panel_and_database_have_the_same_row_count(loaded, app_engine):
    import pandas as pd

    from app.repositories import canonical_repository as canonical

    csv = pd.read_csv(REPO_ROOT / "data" / "processed" / "crop_productivity.csv")
    assert len(canonical.productivity_frame()) == len(csv)


def test_inquiry_table_is_created_with_a_hashed_token_column(engine, migrated):
    """The migration must create the table and must not create a plaintext column."""
    from sqlalchemy import inspect

    columns = {column["name"] for column in inspect(engine).get_columns("inquiry")}
    assert {
        "client_uuid",
        "receipt_token_hash",
        "topic",
        "crop",
        "province",
        "district",
        "message",
        "status",
    } <= columns
    assert "receipt_token" not in columns


def test_inquiry_receipt_token_is_never_stored_in_plaintext(loaded, app_engine):
    """Creation returns the token once; the table keeps only its SHA-256 hash."""
    import hashlib

    from sqlalchemy import text

    from app.services import inquiry_service

    created = inquiry_service.create(
        {
            "topic": "Data question",
            "message": "Canonical storage parity check.",
            "client_uuid": "integration-test-inquiry-1",
        }
    )
    token = created["receipt_token"]
    assert token and created["id"]

    with app_engine.connect() as connection:
        stored = connection.execute(
            text("SELECT receipt_token_hash FROM inquiry WHERE id = :id"),
            {"id": created["id"]},
        ).scalar()
    assert stored != token
    assert stored == hashlib.sha256(token.encode("utf-8")).hexdigest()

    assert inquiry_service.get_by_receipt(created["id"], token) is not None
    assert inquiry_service.get_by_receipt(created["id"], "x" * 40) is None


def test_inquiry_client_uuid_is_idempotent_across_retries(loaded, app_engine):
    from sqlalchemy import text

    from app.services import inquiry_service

    payload = {
        "topic": "Data question",
        "message": "Queued offline retry.",
        "client_uuid": "integration-test-inquiry-2",
    }
    first = inquiry_service.create(payload)
    second = inquiry_service.create(payload)
    assert first["id"] == second["id"]

    with app_engine.connect() as connection:
        count = connection.execute(
            text("SELECT count(*) FROM inquiry WHERE client_uuid = :c"),
            {"c": payload["client_uuid"]},
        ).scalar()
    assert count == 1


OBSERVATION_FILES = (
    "district_productivity_factors.csv",
    "irrigation_water.csv",
    "erosion_control.csv",
    "crop_postharvest_use.csv",
    "national_input_trends.csv",
)


@pytest.mark.parametrize("filename", OBSERVATION_FILES)
def test_observation_read_matches_the_processed_file(loaded, app_engine, filename):
    """A wide file rebuilt from the normalized table must equal the artefact.

    Same columns, same rows, same values - including NULLs and the published
    crop variant. This is what makes the normalized table authoritative for the
    practices/inputs/irrigation/erosion/post-harvest reads.
    """
    import pandas as pd

    from app.repositories import canonical_repository as canonical

    csv = pd.read_csv(REPO_ROOT / "data" / "processed" / filename)
    frame = canonical.observation_frame(filename, columns=list(csv.columns))

    assert list(frame.columns) == list(csv.columns), "column contract drifted"
    assert len(frame) == len(csv), "row count drifted"

    key = [c for c in ("year", "season", "district_code", "crop") if c in csv.columns]
    left = frame.sort_values(key, kind="stable").reset_index(drop=True)
    right = csv.sort_values(key, kind="stable").reset_index(drop=True)
    for column in csv.columns:
        assert _norm(left[column]) == _norm(right[column]), f"{filename}:{column}"


def test_observation_read_honours_the_requested_contract(loaded, app_engine):
    """A narrower contract must be returned exactly, with real values."""
    from app.repositories import canonical_repository as canonical

    contract = [
        "year",
        "season",
        "district",
        "district_code",
        "improved_seed_farmers_pct",
    ]
    frame = canonical.observation_frame(
        "district_productivity_factors.csv", columns=contract
    )
    assert list(frame.columns) == contract
    assert not frame.empty
    assert frame["improved_seed_farmers_pct"].notna().any()


def test_observation_read_keeps_missing_values_missing(loaded, app_engine):
    """A value the source did not publish stays NULL, never zero.

    ``national_input_trends`` is the file that actually carries blank cells, so it
    is the one that can prove the round trip does not invent a zero.
    """
    import pandas as pd

    from app.repositories import canonical_repository as canonical

    csv = pd.read_csv(REPO_ROOT / "data" / "processed" / "national_input_trends.csv")
    blank_columns = [c for c in csv.columns if csv[c].isna().any()]
    assert blank_columns, "fixture assumption: this file has blank cells"

    frame = canonical.observation_frame("national_input_trends.csv", columns=list(csv.columns))
    for column in blank_columns:
        assert int(frame[column].isna().sum()) == int(csv[column].isna().sum()), (
            f"{column}: blank count changed"
        )
        assert int(frame[column].isna().sum()) > 0, f"{column}: blanks disappeared"
        assert int((frame[column] == 0).sum()) == int((csv[column] == 0).sum()), (
            f"{column}: zero count changed"
        )


def test_every_observation_has_a_resolvable_source_table(loaded, app_engine):
    """Normalized observations must carry the same provenance depth as the panel.

    They previously had ``source_table_id = NULL`` across the board while panel
    rows pointed at a real worksheet, so the same platform answered "which table
    is this from?" differently depending on the domain.
    """
    from sqlalchemy import inspect, text

    with app_engine.connect() as connection:
        assert "source_table" in set(inspect(connection).get_table_names())
        unresolvable = connection.execute(
            text(
                "SELECT count(*) FROM agricultural_observation o "
                "LEFT JOIN source_table s ON s.source_table_id = o.source_table_id "
                "WHERE o.source_table_id IS NULL OR s.source_table_id IS NULL"
            )
        ).scalar()
    assert unresolvable == 0, "an observation has no resolvable source table"


def test_attribution_granularity_matches_what_the_extract_supports(loaded, app_engine):
    """A worksheet row must name a sheet; a dataset row must not pretend to."""
    from sqlalchemy import text

    with app_engine.connect() as connection:
        bad_worksheet = connection.execute(
            text(
                "SELECT count(*) FROM source_table "
                "WHERE granularity = 'worksheet' AND (sheet IS NULL OR sheet = '')"
            )
        ).scalar()
    assert bad_worksheet == 0


def test_a_multi_table_extract_keeps_its_reference_list(loaded, app_engine):
    """Irrigation draws on Tables 30-31; the row must not claim just one."""
    import json

    from sqlalchemy import text

    with app_engine.connect() as connection:
        row = connection.execute(
            text(
                "SELECT source_table_id, metadata_json FROM agricultural_observation "
                "WHERE indicator_code = 'surface_irrigation_pct' LIMIT 1"
            )
        ).mappings().one()
        granularity = connection.execute(
            text("SELECT granularity FROM source_table WHERE source_table_id = :i"),
            {"i": row["source_table_id"]},
        ).scalar()

    metadata = row["metadata_json"]
    if isinstance(metadata, str):
        metadata = json.loads(metadata)
    assert metadata["source_tables"] == ["Table 30", "Table 31"]
    assert granularity == "dataset"


def test_market_observations_are_absent_rather_than_zero(engine, loaded):
    """No verified market price dataset exists, so nothing is invented for it."""
    from sqlalchemy import inspect

    tables = set(inspect(engine).get_table_names())
    if "market_price_observation" not in tables:
        pytest.skip("no canonical market table in this schema")
    assert _scalar(engine, "SELECT count(*) FROM market_price_observation") == 0
