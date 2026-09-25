"""Geographic hierarchy: Province -> District -> Sector."""

from __future__ import annotations

import uuid

from geoalchemy2 import Geometry
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Province(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "province"

    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)

    districts: Mapped[list[District]] = relationship(back_populates="province")


class District(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "district"
    __table_args__ = (UniqueConstraint("name", name="uq_district_name"),)

    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64), index=True)
    province_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("province.id"), index=True)
    agro_ecological_zone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # PostGIS geometry (MultiPolygon, WGS84). Nullable until geodata is loaded.
    geometry: Mapped[str | None] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True
    )

    province: Mapped[Province] = relationship(back_populates="districts")
    sectors: Mapped[list[Sector]] = relationship(back_populates="district")


class Sector(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "sector"

    code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64), index=True)
    district_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("district.id"), index=True)
    geometry: Mapped[str | None] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=True
    )

    district: Mapped[District] = relationship(back_populates="sectors")
