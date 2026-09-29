"""Canonical analytical schema — the production persistence layer.

``crop_productivity`` is the canonical multi-period panel (one row per period x
geography x crop x farmer scale) and ``agricultural_observation`` holds survey
indicators — practices, inputs, erosion, irrigation, post-harvest use — in one
normalized shape rather than a table per questionnaire module.

Design notes
------------
* **Business keys, not surrogate UUIDs.** Rows are keyed by the codes the source
  tables and the pipeline already speak (``period_id``, ``crop_code``,
  ``district_code``, ``indicator_code``). A surrogate id would add a translation
  step with no analytical benefit, and would make the deterministic upsert
  harder to reason about.
* **Every table has an explicit unique key.** The loader writes with
  ``INSERT ... ON CONFLICT`` so that re-running the pipeline updates in place
  instead of duplicating, which is impossible without one.
* **``crop_code`` and ``district_code`` are validated, not foreign-keyed.** The
  loader resolves them against ``data/dictionaries`` and flags anything
  unresolvable. Ingestion must not depend on whether the operational
  ``crop``/``district`` dimension tables have been seeded — a chicken-and-egg
  dependency that would make a fresh database impossible to load.
* **``is_synthetic`` is a column, not a convention.** The production query layer
  filters it out explicitly, so a test fixture can never be served as an
  observation.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

# The only geographic levels any source in this repository publishes. Stored
# lowercase to match `/meta/data-coverage` and the web coverage helpers.
GEOGRAPHIC_LEVELS: tuple[str, ...] = ("district", "province", "national")
SEASONS: tuple[str, ...] = ("A", "B", "C")
# `ok` = validated; `review`/`severe` = published source discrepancy kept as-is.
QUALITY_FLAGS: tuple[str, ...] = ("ok", "review", "severe", "unknown")


class Period(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The canonical period dimension.

    Seeded from the data the pipeline actually published, never hard-coded, so a
    period cannot appear in the catalogue before rows exist for it.
    """

    __tablename__ = "period"

    # "2026B"
    period_id: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    season: Mapped[str] = mapped_column(String(1))
    # "2026 Season B"
    label: Mapped[str] = mapped_column(String(32))
    # Sortable key: `year` zero-padded then season, so ordering is correct even
    # when seasons are not a clean time series (A is not "before" B).
    sort_key: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    has_district_coverage: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_national_coverage: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        CheckConstraint("season IN ('A', 'B', 'C')", name="ck_period_season"),
        CheckConstraint("year BETWEEN 2000 AND 2100", name="ck_period_year"),
    )


class Unit(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Measurement unit. ``dimension`` groups convertible units."""

    __tablename__ = "unit"

    unit_code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    dimension: Mapped[str] = mapped_column(String(24))


class Indicator(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Machine-readable data dictionary entry for one observed indicator.

    Served by ``GET /api/v1/metadata/indicators`` and used by the loader to
    validate every observation it writes.
    """

    __tablename__ = "indicator"

    indicator_code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(nullable=True)
    unit_code: Mapped[str] = mapped_column(ForeignKey("unit.unit_code"), index=True)
    domain: Mapped[str] = mapped_column(String(48), index=True)
    # Comma-separated list of the geographic levels this indicator is published
    # at, e.g. "district". Kept as text because it is a display contract, not a
    # join key.
    geographic_levels: Mapped[str] = mapped_column(String(64))
    has_crop_dimension: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_domains: Mapped[str | None] = mapped_column(String(160), nullable=True)


class SourceTable(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One published table inside one source release.

    Provenance at the granularity a reviewer needs: which workbook, which
    worksheet, and the original title — including titles whose numeric prefix
    looks like a typo. Original titles are stored verbatim so a source anomaly is
    recorded rather than silently "corrected".
    """

    __tablename__ = "source_table"

    source_table_id: Mapped[str] = mapped_column(String(96), unique=True, index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("data_source.source_id"), index=True)
    workbook: Mapped[str | None] = mapped_column(String(160), nullable=True)
    sheet: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_title_original: Mapped[str | None] = mapped_column(String(512), nullable=True)
    period_id: Mapped[str | None] = mapped_column(ForeignKey("period.period_id"), nullable=True)
    source_url: Mapped[str | None] = mapped_column(nullable=True)
    extraction_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DatasetVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Identity of one built + loaded dataset release (lineage root)."""

    __tablename__ = "dataset_version"

    version: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    pipeline_version: Mapped[str | None] = mapped_column(String(16), nullable=True)
    git_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    build_timestamp: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    transformation_version: Mapped[str | None] = mapped_column(String(16), nullable=True)
    row_counts: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    validation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    warnings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    loaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DataIngestionRun(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One loader run per target table: what went in, and what was rejected."""

    __tablename__ = "data_ingestion_run"

    dataset_version: Mapped[str] = mapped_column(
        ForeignKey("dataset_version.version"), index=True
    )
    target_table: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(16))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    accepted_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rejected_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    inserted_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unchanged_rows: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    dry_run: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    warnings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reject_reasons: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'succeeded', 'failed', 'skipped')",
            name="ck_data_ingestion_run_status",
        ),
    )


class CropProductivity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Canonical multi-period crop productivity panel.

    One row per period x geographic level x geography x crop x farmer scale.
    Yield is always the published harvested-area-based figure; it is never
    recomputed by averaging across crops.
    """

    __tablename__ = "crop_productivity"

    period_id: Mapped[str] = mapped_column(ForeignKey("period.period_id"), index=True)
    year: Mapped[int] = mapped_column(Integer, index=True)
    season: Mapped[str] = mapped_column(String(1))
    geography_level: Mapped[str] = mapped_column(String(16))
    geography_code: Mapped[str] = mapped_column(String(24))
    province_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    district_code: Mapped[str | None] = mapped_column(String(16), index=True, nullable=True)
    district_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    province_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    crop_code: Mapped[str] = mapped_column(String(16), index=True)
    crop_name: Mapped[str] = mapped_column(String(64), index=True)
    farmer_scale: Mapped[str] = mapped_column(String(8), default="all", nullable=False)
    row_scope: Mapped[str | None] = mapped_column(String(16), nullable=True)

    cultivated_area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    harvested_area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    production_mt: Mapped[float | None] = mapped_column(Float, nullable=True)
    yield_kg_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    harvest_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    cultivated_area_reported: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    yield_reported: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    source_id: Mapped[str] = mapped_column(ForeignKey("data_source.source_id"), index=True)
    source_table_id: Mapped[str | None] = mapped_column(
        ForeignKey("source_table.source_table_id"), nullable=True
    )
    dataset_version: Mapped[str] = mapped_column(ForeignKey("dataset_version.version"), index=True)
    quality_flag: Mapped[str] = mapped_column(String(16), default="ok", nullable=False)
    quality_note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "period_id",
            "geography_level",
            "geography_code",
            "crop_code",
            "farmer_scale",
            name="uq_crop_productivity_key",
        ),
        CheckConstraint("season IN ('A', 'B', 'C')", name="ck_crop_productivity_season"),
        CheckConstraint(
            "geography_level IN ('district', 'province', 'national')",
            name="ck_crop_productivity_geography_level",
        ),
        CheckConstraint(
            "cultivated_area_ha IS NULL OR cultivated_area_ha >= 0",
            name="ck_crop_productivity_cultivated_non_negative",
        ),
        CheckConstraint(
            "harvested_area_ha IS NULL OR harvested_area_ha >= 0",
            name="ck_crop_productivity_harvested_non_negative",
        ),
        CheckConstraint(
            "production_mt IS NULL OR production_mt >= 0",
            name="ck_crop_productivity_production_non_negative",
        ),
        CheckConstraint(
            "yield_kg_ha IS NULL OR yield_kg_ha >= 0",
            name="ck_crop_productivity_yield_non_negative",
        ),
        CheckConstraint(
            "quality_flag IN ('ok', 'review', 'severe', 'unknown')",
            name="ck_crop_productivity_quality_flag",
        ),
        # The composite indexes the analytical queries actually use:
        # period x crop (crop profile), period x district (scorecard), and the
        # three-way key (map of one crop in one period).
        Index("ix_crop_productivity_period_crop", "period_id", "crop_code"),
        Index("ix_crop_productivity_period_district", "period_id", "district_code"),
        Index(
            "ix_crop_productivity_period_crop_district",
            "period_id",
            "crop_code",
            "district_code",
        ),
    )


class AgriculturalObservation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One normalized survey observation (practice, input, erosion, water, use).

    ``crop_code`` is null for district-wide indicators (land use, erosion
    coverage) and set for crop-specific ones (post-harvest use shares). A null is
    genuinely "not crop-specific"; it is never a substitute for a missing value —
    a missing measurement is simply an absent row, and ``value`` is never
    coerced from a blank or a dash to zero.
    """

    __tablename__ = "agricultural_observation"

    period_id: Mapped[str] = mapped_column(ForeignKey("period.period_id"), index=True)
    geography_level: Mapped[str] = mapped_column(String(16))
    geography_code: Mapped[str] = mapped_column(String(24))
    province_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    district_code: Mapped[str | None] = mapped_column(String(16), index=True, nullable=True)
    crop_code: Mapped[str | None] = mapped_column(String(16), index=True, nullable=True)
    # The published crop variant when the source is finer-grained than the
    # canonical crop. NISR publishes use-of-production per variety — "Cooking
    # banana", "Dessert banana" and "Banana for beer" all canonicalise to
    # Banana — so without this column three distinct published observations
    # would collapse into one.
    #
    # NOT NULL with an empty-string sentinel rather than NULL, because this
    # column participates in the unique key and PostgreSQL treats NULLs as
    # distinct: a nullable column here would silently stop enforcing uniqueness.
    crop_variant: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    farmer_scale: Mapped[str] = mapped_column(String(8), default="all", nullable=False)

    indicator_code: Mapped[str] = mapped_column(ForeignKey("indicator.indicator_code"), index=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit_code: Mapped[str] = mapped_column(ForeignKey("unit.unit_code"), index=True)

    source_id: Mapped[str] = mapped_column(ForeignKey("data_source.source_id"), index=True)
    source_table_id: Mapped[str | None] = mapped_column(
        ForeignKey("source_table.source_table_id"), nullable=True
    )
    dataset_version: Mapped[str] = mapped_column(ForeignKey("dataset_version.version"), index=True)
    quality_flag: Mapped[str] = mapped_column(String(16), default="ok", nullable=False)
    quality_note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "period_id",
            "geography_level",
            "geography_code",
            "crop_code",
            "crop_variant",
            "farmer_scale",
            "indicator_code",
            name="uq_agricultural_observation_key",
        ),
        CheckConstraint(
            "geography_level IN ('district', 'province', 'national')",
            name="ck_agricultural_observation_geography_level",
        ),
        CheckConstraint(
            "quality_flag IN ('ok', 'review', 'severe', 'unknown')",
            name="ck_agricultural_observation_quality_flag",
        ),
        # Percentages must be plausible; a value above 100 is a source error
        # worth catching rather than publishing.
        CheckConstraint(
            "value IS NULL OR value <= 100 * 1000",
            name="ck_agricultural_observation_value_bound",
        ),
        Index("ix_agricultural_observation_period_indicator", "period_id", "indicator_code"),
        Index(
            "ix_agricultural_observation_period_district",
            "period_id",
            "district_code",
        ),
    )
