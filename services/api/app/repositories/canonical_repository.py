"""Read-only access to the canonical PostgreSQL tables.

PostgreSQL is the production persistence layer for published agricultural
statistics. Every reader here is explicit about whether the canonical tables are
actually available: a missing migration or an unreachable database is reported
as such, never disguised as "no data".

The probe distinguishes three states, which the API needs to keep apart:

* **unavailable** — the database cannot be reached, or the canonical tables have
  not been created (``make migrate`` has not run here).
* **empty** — the schema is present but no dataset has been loaded, so the
  pipeline has not been run against this database.
* **ready** — rows are present and canonical reads are authoritative.

Historical summaries stay out of this module on purpose. Sourcing a trend from
the canonical tables instead of the processed CSV is a read-path change with its
own verification, and it is tracked separately rather than smuggled in here.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import func, select

Availability = Literal["ready", "empty", "unavailable"]

# Tables that must exist before a canonical read means anything.
REQUIRED_TABLES = ("period", "crop_productivity", "agricultural_observation", "dataset_version")


def _engine():
    from app.db.session import engine

    return engine


def probe() -> dict:
    """Whether canonical reads are usable, and why not when they are not."""
    from sqlalchemy import inspect

    try:
        engine = _engine()
        with engine.connect() as connection:
            tables = set(inspect(connection).get_table_names())
            missing = [name for name in REQUIRED_TABLES if name not in tables]
            if missing:
                return {
                    "availability": "unavailable",
                    # Reason strings are shown by the readiness payload, which must
                    # not disclose filesystem paths, so no slash appears here.
                    "reason": (
                        "canonical tables not created in this database (missing: "
                        f"{', '.join(missing)}); apply the Alembic migrations"
                    ),
                    "row_counts": {},
                }
            row_counts = {
                name: int(
                    connection.execute(select(func.count()).select_from(_table(name))).scalar() or 0
                )
                for name in REQUIRED_TABLES
            }
    except Exception as error:  # noqa: BLE001 - a probe reports, it does not raise
        return {
            "availability": "unavailable",
            "reason": f"database unreachable: {type(error).__name__}",
            "row_counts": {},
        }

    if row_counts.get("crop_productivity", 0) == 0:
        return {
            "availability": "empty",
            "reason": (
                "canonical schema present but no dataset loaded; "
                "run the canonical loader (scripts.data.load_postgres)"
            ),
            "row_counts": row_counts,
        }
    return {"availability": "ready", "reason": None, "row_counts": row_counts}


def _table(name: str):
    import app.models  # noqa: F401  (registers every table on Base.metadata)
    from app.db.base import Base

    return Base.metadata.tables[name]


def current_version() -> dict | None:
    """The dataset version the canonical tables were last loaded from."""
    from app.models.canonical import DatasetVersion

    with _engine().connect() as connection:
        row = connection.execute(
            select(DatasetVersion)
            .order_by(DatasetVersion.loaded_at.desc().nullslast(), DatasetVersion.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
    if row is None:
        return None
    return {
        "version": row.version,
        "pipeline_version": row.pipeline_version,
        "git_sha": row.git_sha,
        "build_timestamp": row.build_timestamp,
        "transformation_version": row.transformation_version,
        "source_hash": row.source_hash,
        "row_counts": row.row_counts or {},
        "validation": row.validation or {},
        "loaded_at": row.loaded_at.isoformat() if row.loaded_at else None,
    }


def entity_counts() -> dict:
    """Counts behind the coverage endpoint, all sourced from canonical tables.

    Synthetic rows are excluded explicitly. A test fixture must never be counted
    as an observation, however it reached the table.
    """
    from app.models.canonical import AgriculturalObservation, CropProductivity, Period, SourceTable

    with _engine().connect() as connection:
        productivity = select(func.count()).select_from(CropProductivity).where(
            CropProductivity.is_synthetic.is_(False)
        )
        observations = select(func.count()).select_from(AgriculturalObservation).where(
            AgriculturalObservation.is_synthetic.is_(False)
        )
        return {
            "periods": int(connection.execute(select(func.count()).select_from(Period)).scalar() or 0),
            "crops": int(
                connection.execute(
                    select(func.count(func.distinct(CropProductivity.crop_code))).where(
                        CropProductivity.is_synthetic.is_(False)
                    )
                ).scalar()
                or 0
            ),
            "districts": int(
                connection.execute(
                    select(func.count(func.distinct(CropProductivity.district_code))).where(
                        CropProductivity.is_synthetic.is_(False)
                    )
                ).scalar()
                or 0
            ),
            "productivity_records": int(connection.execute(productivity).scalar() or 0),
            "factor_observations": int(connection.execute(observations).scalar() or 0),
            "source_tables": int(
                connection.execute(select(func.count()).select_from(SourceTable)).scalar() or 0
            ),
            "dataset_versions": int(
                connection.execute(select(func.count()).select_from(_table("dataset_version"))).scalar() or 0
            ),
        }


def coverage_rows() -> list[dict]:
    """Period x geographic level coverage, computed from the canonical tables."""
    from app.models.canonical import AgriculturalObservation, CropProductivity

    with _engine().connect() as connection:
        rows = connection.execute(
            select(
                CropProductivity.period_id,
                CropProductivity.geography_level,
                func.count().label("n_rows"),
                func.count(func.distinct(CropProductivity.crop_code)).label("n_crops"),
                func.count(func.distinct(CropProductivity.district_code)).label("n_districts"),
            )
            .where(CropProductivity.is_synthetic.is_(False))
            .group_by(CropProductivity.period_id, CropProductivity.geography_level)
            .order_by(CropProductivity.period_id, CropProductivity.geography_level)
        ).all()
        observation_counts = dict(
            connection.execute(
                select(AgriculturalObservation.period_id, func.count())
                .where(AgriculturalObservation.is_synthetic.is_(False))
                .group_by(AgriculturalObservation.period_id)
            ).all()
        )

    return [
        {
            "dataset": "crop_productivity",
            "period": str(row.period_id),
            "coverage_level": str(row.geography_level),
            "n_rows": int(row.n_rows),
            "n_crops": int(row.n_crops),
            "n_districts": int(row.n_districts),
            "n_observations": int(observation_counts.get(row.period_id, 0)),
        }
        for row in rows
    ]


def indicator_rows() -> list[dict]:
    """The data dictionary as stored in the database."""
    from app.models.canonical import Indicator

    with _engine().connect() as connection:
        rows = connection.execute(
            select(Indicator).order_by(Indicator.domain, Indicator.indicator_code)
        ).scalars().all()
    return [
        {
            "indicator_code": row.indicator_code,
            "name": row.name,
            "description": row.description,
            "unit_code": row.unit_code,
            "domain": row.domain,
            "geographic_levels": row.geographic_levels.split(","),
            "has_crop_dimension": row.has_crop_dimension,
        }
        for row in rows
    ]


def generated_at() -> str:
    return datetime.now(UTC).isoformat()
