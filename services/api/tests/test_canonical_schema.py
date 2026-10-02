"""The canonical migration must match the canonical models.

Autogenerate normally guarantees this, but it needs a live database — and the
revision was necessarily hand-written because none was available when it was
authored. This test closes that gap without a database by rendering the whole
migration chain offline with ``alembic upgrade head --sql`` and comparing the
result against ``Base.metadata``.

It catches the failure mode that actually matters: a model gains a column or an
index, the migration is not regenerated, and a load then fails in production
against a schema that never had it.
"""

from __future__ import annotations

import io
import re
from contextlib import redirect_stdout
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.db.base import Base

API_DIR = Path(__file__).resolve().parents[1]

CANONICAL_TABLES = (
    "period",
    "unit",
    "indicator",
    "dataset_version",
    "source_table",
    "data_ingestion_run",
    "crop_productivity",
    "agricultural_observation",
)


def _alembic_config() -> Config:
    """Alembic config with an absolute script location.

    `alembic.ini` uses a relative `script_location`, which only resolves when the
    process happens to run from `services/api`. Pinning it keeps the test correct
    whatever directory pytest was invoked from.
    """
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(API_DIR / "alembic"))
    return config


@pytest.fixture(scope="module")
def offline_sql() -> str:
    """The full migration chain rendered to SQL, with no database connection."""
    buffer = io.StringIO()
    # Alembic writes the script to stdout in offline mode.
    with redirect_stdout(buffer):
        command.upgrade(_alembic_config(), "head", sql=True)
    return buffer.getvalue()


def _create_table_block(sql: str, table: str) -> str:
    marker = f"CREATE TABLE {table} ("
    start = sql.index(marker)
    end = sql.index(");", start)
    return sql[start:end]


def _column_is_migrated(sql: str, table: str, column: str) -> bool:
    """Whether a model column is created by the chain.

    Either it is part of the table's ``CREATE TABLE``, or a later revision adds it
    with ``ALTER TABLE ... ADD COLUMN``. Both are correct; rewriting an already
    shared revision to fold a new column into its original ``CREATE TABLE`` is
    not, so an incremental migration has to satisfy this guard too.
    """
    if re.search(rf"(?<![\w]){re.escape(column)}(?![\w])", _create_table_block(sql, table)):
        return True
    return bool(
        re.search(
            rf"ALTER TABLE\s+{re.escape(table)}\s+ADD COLUMN\s+{re.escape(column)}\b",
            sql,
        )
    )


def test_the_migration_chain_has_a_single_head():
    """One head: a second head means a branch nobody will merge by accident."""
    script = ScriptDirectory.from_config(_alembic_config())
    assert len(script.get_heads()) == 1, script.get_heads()


def test_migration_renders_offline(offline_sql):
    assert "CREATE TABLE crop_productivity (" in offline_sql
    assert "CREATE EXTENSION IF NOT EXISTS postgis" in offline_sql


@pytest.mark.parametrize("table", CANONICAL_TABLES)
def test_every_canonical_table_is_created(table, offline_sql):
    assert f"CREATE TABLE {table} (" in offline_sql, f"{table} missing from the migration"


@pytest.mark.parametrize("table", CANONICAL_TABLES)
def test_every_model_column_exists_in_the_migration(table, offline_sql):
    missing = [
        column.name
        for column in Base.metadata.tables[table].columns
        if not _column_is_migrated(offline_sql, table, column.name)
    ]
    assert not missing, f"{table}: columns in the model but not the migration: {missing}"


@pytest.mark.parametrize("table", CANONICAL_TABLES)
def test_every_model_index_exists_in_the_migration(table, offline_sql):
    # `INDEX <name>` rather than `CREATE INDEX <name>`: a unique=True index in the
    # model renders as `CREATE UNIQUE INDEX`, and both are correct.
    missing = [
        index.name
        for index in Base.metadata.tables[table].indexes
        if index.name and f"INDEX {index.name} " not in offline_sql
    ]
    assert not missing, f"{table}: indexes in the model but not the migration: {missing}"


@pytest.mark.parametrize(
    "table,index_name",
    [
        ("period", "ix_period_period_id"),
        ("source_table", "ix_source_table_source_table_id"),
        ("dataset_version", "ix_dataset_version_version"),
    ],
)
def test_natural_keys_are_enforced_unique_by_an_index(table, index_name, offline_sql):
    """A natural key without a unique index silently permits duplicate rows."""
    assert f"CREATE UNIQUE INDEX {index_name} " in offline_sql


def test_every_named_unique_and_check_constraint_exists_in_the_migration(offline_sql):
    missing: list[str] = []
    for table in CANONICAL_TABLES:
        for constraint in Base.metadata.tables[table].constraints:
            name = getattr(constraint, "name", None)
            if not name:
                continue
            # Named constraints appear verbatim in the rendered DDL.
            if name not in offline_sql:
                missing.append(f"{table}.{name}")
    assert not missing, f"constraints in the model but not the migration: {missing}"


def test_crop_productivity_unique_key_matches_the_data():
    """The upsert key must be the one the processed panel is actually unique on.

    If this drifts, a re-run of the loader either duplicates rows or silently
    overwrites distinct observations.
    """
    key = {
        "period_id",
        "geography_level",
        "geography_code",
        "crop_code",
        "farmer_scale",
    }
    unique = [
        constraint
        for constraint in Base.metadata.tables["crop_productivity"].constraints
        if constraint.name == "uq_crop_productivity_key"
    ]
    assert len(unique) == 1
    assert {column.name for column in unique[0].columns} == key


def test_non_negative_metrics_are_enforced_by_the_database():
    """A negative published area is a source error, not a value to store."""
    checks = {
        constraint.name
        for constraint in Base.metadata.tables["crop_productivity"].constraints
        if constraint.name and constraint.name.startswith("ck_crop_productivity")
    }
    for expected in (
        "ck_crop_productivity_cultivated_non_negative",
        "ck_crop_productivity_harvested_non_negative",
        "ck_crop_productivity_production_non_negative",
        "ck_crop_productivity_yield_non_negative",
        "ck_crop_productivity_geography_level",
        "ck_crop_productivity_season",
    ):
        assert expected in checks
