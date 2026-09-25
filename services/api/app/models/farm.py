"""Farmer-side operational models."""

from __future__ import annotations

import uuid

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Cooperative(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "cooperative"

    name: Mapped[str] = mapped_column(String(160), index=True)
    registration_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("district.id"), nullable=True, index=True
    )


class FarmerProfile(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "farmer_profile"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"), index=True)
    cooperative_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("cooperative.id"), nullable=True, index=True
    )
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("district.id"), nullable=True, index=True
    )
    # Consent is explicit and versioned; GPS/photo are optional.
    consent_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    language: Mapped[str] = mapped_column(String(8), default="en")


class Farm(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "farm"

    farmer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farmer_profile.id"), index=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("district.id"), nullable=True, index=True
    )
    sector_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sector.id"), nullable=True, index=True
    )
    name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    area_ha: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Optional and coarse by design (never expose exact individual locations).
    location: Mapped[str | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    gps_consent: Mapped[bool] = mapped_column(Boolean, default=False)

    farmer: Mapped[FarmerProfile] = relationship()
