"""Field operations, sync, data-source registry and audit models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ProvenanceMixin, TimestampMixin, UUIDPrimaryKeyMixin


class FieldObservation(UUIDPrimaryKeyMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "field_observation"

    officer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"), index=True)
    farm_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("farm.id"), nullable=True, index=True)
    observation_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    notes: Mapped[str | None] = mapped_column(nullable=True)
    photo_url: Mapped[str | None] = mapped_column(nullable=True)
    client_uuid: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)


class VerificationTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "verification_task"

    officer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"), index=True)
    target_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="PENDING")
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(nullable=True)


class SyncEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Idempotency + audit trail for offline mobile mutations."""

    __tablename__ = "sync_event"

    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    client_uuid: Mapped[str | None] = mapped_column(String(64), index=True)
    server_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    operation: Mapped[str | None] = mapped_column(String(16), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="SYNCED")
    payload_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


class DataSource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "data_source"

    source_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    owner: Mapped[str | None] = mapped_column(String(96), nullable=True)
    dataset_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    source_url: Mapped[str | None] = mapped_column(nullable=True)
    source_period: Mapped[str | None] = mapped_column(String(48), nullable=True)
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    access_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    license_or_terms: Mapped[str | None] = mapped_column(nullable=True)
    raw_file: Mapped[str | None] = mapped_column(nullable=True)
    processing_script: Mapped[str | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(nullable=True)


class AuditLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "audit_log"

    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"), index=True)
    action: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(nullable=True)
    at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
