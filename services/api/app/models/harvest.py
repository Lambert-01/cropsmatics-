"""Harvest registration and post-harvest risk models."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import Boolean, Date, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, ProvenanceMixin, TimestampMixin, UUIDPrimaryKeyMixin


class HarvestRegistration(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "harvest_registration"

    farm_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("farm.id"), nullable=True, index=True
    )
    farmer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("farmer_profile.id"), nullable=True, index=True
    )
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("district.id"), nullable=True, index=True
    )
    crop_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("crop.id"), nullable=True, index=True
    )
    # Denormalized names captured from the field (validated against dictionaries)
    # so offline sync does not depend on reference rows already existing server-side.
    district_name: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    crop_name: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    expected_harvest_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_quantity_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_quantity_kg: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Offline-first mobile fields.
    client_uuid: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    is_offline_created: Mapped[bool] = mapped_column(Boolean, default=False)
    sync_status: Mapped[str] = mapped_column(String(16), default="SYNCED")

    risks: Mapped[list["RiskScore"]] = relationship(back_populates="harvest")


class RiskScore(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "risk_score"

    harvest_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("harvest_registration.id"), index=True)
    probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    band: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Contributing factors / recommended actions stored as JSON text.
    contributing_factors: Mapped[str | None] = mapped_column(nullable=True)
    recommended_actions: Mapped[str | None] = mapped_column(nullable=True)

    harvest: Mapped[HarvestRegistration] = relationship(back_populates="risks")
