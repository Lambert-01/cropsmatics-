"""Storage/collection facility models."""

from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, ProvenanceMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Facility(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "facility"

    name: Mapped[str] = mapped_column(String(160), index=True)
    facility_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("district.id"), nullable=True, index=True
    )
    location: Mapped[str | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    # Verification is explicit: an unverified facility is never given a fake capacity.
    verification_status: Mapped[str] = mapped_column(String(16), default="UNVERIFIED")
    cold_chain: Mapped[bool] = mapped_column(Boolean, default=False)

    capacity_snapshots: Mapped[list["FacilityCapacitySnapshot"]] = relationship(
        back_populates="facility"
    )


class FacilityCapacitySnapshot(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "facility_capacity_snapshot"

    facility_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("facility.id"), index=True)
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    crop_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("crop.id"), nullable=True, index=True
    )
    # total/available capacity may be NULL => "not verified" in the UI.
    capacity_total_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    capacity_available_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    facility: Mapped[Facility] = relationship(back_populates="capacity_snapshots")
