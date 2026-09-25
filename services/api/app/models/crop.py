"""Crop reference model."""

from __future__ import annotations

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Crop(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "crop"

    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name_kinyarwanda: Mapped[str | None] = mapped_column(String(64), nullable=True)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    perishability: Mapped[str | None] = mapped_column(String(16), nullable=True)
    cold_chain_recommended: Mapped[bool] = mapped_column(Boolean, default=False)
