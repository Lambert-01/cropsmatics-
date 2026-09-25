"""Analytical models: official indicators, productivity metrics, gaps, priorities."""

from __future__ import annotations

import uuid

from sqlalchemy import Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ProvenanceMixin, TimestampMixin, UUIDPrimaryKeyMixin


class OfficialIndicator(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    """A single official statistical value (never synthetic)."""

    __tablename__ = "official_indicator"

    indicator_code: Mapped[str] = mapped_column(String(64), index=True)
    year: Mapped[int | None] = mapped_column(nullable=True, index=True)
    season: Mapped[str | None] = mapped_column(String(4), nullable=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("district.id"), nullable=True, index=True
    )
    crop_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("crop.id"), nullable=True, index=True
    )
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    uses_survey_weights: Mapped[bool | None] = mapped_column(nullable=True)


class ProductivityMetric(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "productivity_metric"

    year: Mapped[int] = mapped_column(index=True)
    season: Mapped[str] = mapped_column(String(4), index=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("district.id"), index=True)
    crop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("crop.id"), index=True)
    cultivated_area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    harvested_area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    production_mt: Mapped[float | None] = mapped_column(Float, nullable=True)
    yield_kg_ha: Mapped[float | None] = mapped_column(Float, nullable=True)


class ProductivityGap(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "productivity_gap"

    year: Mapped[int] = mapped_column(index=True)
    season: Mapped[str] = mapped_column(String(4), index=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("district.id"), index=True)
    crop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("crop.id"), index=True)
    observed_yield_kg_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    benchmark_yield_kg_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    gap_index: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Benchmark strategy is stored so results are reproducible/reviewable.
    benchmark_strategy: Mapped[str | None] = mapped_column(String(64), nullable=True)


class InterventionPriority(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "intervention_priority"

    year: Mapped[int | None] = mapped_column(nullable=True, index=True)
    season: Mapped[str | None] = mapped_column(String(4), nullable=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("district.id"), index=True)
    crop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("crop.id"), index=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    band: Mapped[str | None] = mapped_column(String(16), nullable=True)
    gap_component: Mapped[float | None] = mapped_column(Float, nullable=True)
    vulnerability_component: Mapped[float | None] = mapped_column(Float, nullable=True)
    affected_scale_component: Mapped[float | None] = mapped_column(Float, nullable=True)
    readiness_component: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_component: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_config: Mapped[str | None] = mapped_column(nullable=True)


class ModelVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "model_version"
    __table_args__ = (UniqueConstraint("name", "version", name="uq_model_version"),)

    name: Mapped[str] = mapped_column(String(64), index=True)
    version: Mapped[str] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(nullable=True)
    metrics: Mapped[str | None] = mapped_column(nullable=True)
    artifact_path: Mapped[str | None] = mapped_column(nullable=True)
