"""Market, recommendation and notification models."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ProvenanceMixin, TimestampMixin, UUIDPrimaryKeyMixin


class MarketPrice(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "market_price"

    crop_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("crop.id"), nullable=True, index=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("district.id"), nullable=True, index=True
    )
    price_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    price_rwf_per_kg: Mapped[float | None] = mapped_column(Float, nullable=True)


class Recommendation(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "recommendation"

    target_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    recommendation_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    text_en: Mapped[str | None] = mapped_column(nullable=True)
    text_rw: Mapped[str | None] = mapped_column(nullable=True)
    # Evidence stays as JSON text so callers can see exactly what supported it.
    evidence: Mapped[str | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="PROPOSED")
    accepted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    outcome: Mapped[str | None] = mapped_column(nullable=True)


class Notification(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notification"

    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"), index=True)
    title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    body: Mapped[str | None] = mapped_column(nullable=True)
    channel: Mapped[str | None] = mapped_column(String(16), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
