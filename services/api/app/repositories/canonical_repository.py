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

import pandas as pd
from sqlalchemy import func, select

Availability = Literal["ready", "empty", "unavailable"]

# The processed panel's column contract. A canonical read reproduces this shape
# exactly (same names, same units, same missing-is-None behaviour) so a caller
# cannot tell which layer answered except through the reported `source`. Columns
# with no dedicated table column are unpacked from `metadata_json`, which the
# loader fills from the processed row.
PRODUCTIVITY_COLUMNS: tuple[str, ...] = (
    "period_code",
    "year",
    "season",
    "geography_level",
    "geography_code",
    "district",
    "district_code",
    "province",
    "agro_ecological_zone",
    "farmer_scale",
    "row_scope",
    "row_scope_raw",
    "crop_code",
    "crop_name_raw",
    "canonical_crop_name",
    "category",
    "perishability",
    "cold_chain_recommended",
    "cultivated_area_ha",
    "harvested_area_ha",
    "production_mt",
    "yield_kg_ha",
    "cultivated_area_reported",
    "yield_reported",
    "harvest_ratio",
    "source_id",
    "source_period",
    "source_release",
    "source_workbook",
    "source_sheets",
    "source_titles_raw",
    "period_override_reason",
    "metric_source_map",
    "source_row_min",
    "processing_script",
    "processing_version",
    "is_synthetic",
)

# Columns read straight off the table; everything else comes from metadata_json.
_DIRECT_COLUMNS: tuple[str, ...] = (
    "year",
    "season",
    "geography_code",
    "district_code",
    "farmer_scale",
    "row_scope",
    "crop_code",
    "cultivated_area_ha",
    "harvested_area_ha",
    "production_mt",
    "yield_kg_ha",
    "cultivated_area_reported",
    "yield_reported",
    "harvest_ratio",
    "source_id",
    "is_synthetic",
)

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


# --------------------------------------------------------------------------
# analytical reads
# --------------------------------------------------------------------------


def is_ready() -> bool:
    """Whether canonical reads can be served right now (probe without detail)."""
    return probe()["availability"] == "ready"


def _metadata(row: dict) -> dict:
    value = row.get("metadata_json")
    return value if isinstance(value, dict) else {}


def _sheets_value(value) -> str | None:
    """`metadata_json.source_sheets` back to the panel's ``a|b`` form."""
    if value is None:
        return None
    if isinstance(value, list):
        parts = [str(v).strip() for v in value if str(v).strip()]
        return "|".join(parts) or None
    return str(value)


def _productivity_row(row: dict) -> dict:
    """One canonical row projected onto the processed panel's contract."""
    metadata = _metadata(row)
    projected: dict = {
        "period_code": row.get("period_id"),
        # The processed panel stores geographic levels uppercase; preserve that
        # so every consumer comparing to "DISTRICT" keeps working unchanged.
        "geography_level": str(row.get("geography_level") or "").upper(),
        "district": row.get("district_name"),
        "province": row.get("province_name"),
        "canonical_crop_name": row.get("crop_name"),
        "agro_ecological_zone": metadata.get("agro_ecological_zone"),
        "row_scope_raw": metadata.get("row_scope_raw"),
        "crop_name_raw": metadata.get("crop_name_raw"),
        "category": metadata.get("category"),
        "perishability": metadata.get("perishability"),
        "cold_chain_recommended": metadata.get("cold_chain_recommended"),
        "source_period": metadata.get("source_period"),
        "source_release": metadata.get("source_release"),
        "source_workbook": metadata.get("source_workbook"),
        "source_sheets": _sheets_value(metadata.get("source_sheets")),
        "source_titles_raw": metadata.get("source_titles_raw"),
        "period_override_reason": metadata.get("period_override_reason"),
        "metric_source_map": metadata.get("metric_source_map"),
        "source_row_min": metadata.get("source_row_min"),
        "processing_script": metadata.get("processing_script"),
        "processing_version": metadata.get("processing_version"),
    }
    for column in _DIRECT_COLUMNS:
        projected[column] = row.get(column)
    return projected


def productivity_frame(
    *,
    period_id: str | None = None,
    geography_level: str | None = None,
    crop_code: str | None = None,
    district_code: str | None = None,
    farmer_scale: str | None = None,
    include_synthetic: bool = False,
) -> pd.DataFrame:
    """The canonical productivity panel as a processed-panel-shaped DataFrame.

    Missing stays missing: a NULL metric is passed through as ``None`` rather than
    coerced to zero, exactly as the processed CSV does.
    """
    from app.models.canonical import CropProductivity

    statement = select(CropProductivity)
    if period_id is not None:
        statement = statement.where(CropProductivity.period_id == period_id)
    if geography_level is not None:
        statement = statement.where(
            CropProductivity.geography_level == geography_level.strip().lower()
        )
    if crop_code is not None:
        statement = statement.where(CropProductivity.crop_code == crop_code)
    if district_code is not None:
        statement = statement.where(CropProductivity.district_code == district_code)
    if farmer_scale is not None:
        statement = statement.where(CropProductivity.farmer_scale == farmer_scale)
    if not include_synthetic:
        # A test fixture must never be served as an observation.
        statement = statement.where(CropProductivity.is_synthetic.is_(False))

    with _engine().connect() as connection:
        raw = [dict(row) for row in connection.execute(statement).mappings().all()]

    rows = [_productivity_row(row) for row in raw]
    frame = pd.DataFrame(rows, columns=list(PRODUCTIVITY_COLUMNS))
    return frame


def productivity_periods() -> list[str]:
    """Published periods that actually carry productivity rows, chronological."""
    from app.models.canonical import CropProductivity

    with _engine().connect() as connection:
        rows = connection.execute(
            select(CropProductivity.year, CropProductivity.season)
            .where(CropProductivity.is_synthetic.is_(False))
            .distinct()
        ).all()
    return sorted(f"{int(year)}{str(season).upper()}" for year, season in rows)
