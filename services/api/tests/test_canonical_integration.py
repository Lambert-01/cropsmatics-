"""End-to-end canonical database tests against a real PostgreSQL.

These are the only tests that exercise the migrations, the loader, and the
canonical query path for real, so they are the ones that prove the pipeline's
definition of done rather than approximating it offline.

They **skip by default**. No CI run and no developer machine should be able to
reach a production database by accident, so a test database must be named
explicitly:

    CANONICAL_TEST_DATABASE_URL=postgresql+psycopg://user:pw@host/db \\
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

    # The second run must record the rows as unchanged, not as fresh inserts.
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
                    " crop_name, crop_variant, farmer_scale, production_mt, source_id, "
                    " dataset_version, quality_flag, is_synthetic, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), '2026B', 2026, 'B', 'district', 'RW-EA-BUG', "
                    " 'CROP-MAI', 'Maize', '', 'all', -1, "
                    " (SELECT source_id FROM data_source LIMIT 1), "
                    " (SELECT version FROM dataset_version LIMIT 1), 'ok', false, now(), now())"
                )
            )


def test_market_observations_are_absent_rather_than_zero(engine, loaded):
    """No verified market price dataset exists, so nothing is invented for it."""
    from sqlalchemy import inspect

    tables = set(inspect(engine).get_table_names())
    if "market_price_observation" not in tables:
        pytest.skip("no canonical market table in this schema")
    assert _scalar(engine, "SELECT count(*) FROM market_price_observation") == 0
