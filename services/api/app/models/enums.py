"""Shared enumerations used by models and schemas."""

from __future__ import annotations

import enum


class RoleName(str, enum.Enum):
    FARMER = "FARMER"
    COOPERATIVE = "COOPERATIVE"
    FIELD_OFFICER = "FIELD_OFFICER"
    FACILITY_MANAGER = "FACILITY_MANAGER"
    DISTRICT_ANALYST = "DISTRICT_ANALYST"
    NATIONAL_ANALYST = "NATIONAL_ANALYST"
    ADMIN = "ADMIN"


class RiskBand(str, enum.Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"


class PriorityBand(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class VerificationStatus(str, enum.Enum):
    UNVERIFIED = "UNVERIFIED"
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"


class FacilityType(str, enum.Enum):
    COLLECTION_CENTER = "COLLECTION_CENTER"
    PACKHOUSE = "PACKHOUSE"
    COLD_ROOM = "COLD_ROOM"
    WAREHOUSE = "WAREHOUSE"
    MARKET = "MARKET"


class SyncStatus(str, enum.Enum):
    PENDING = "PENDING"
    SYNCED = "SYNCED"
    CONFLICT = "CONFLICT"
    FAILED = "FAILED"


class RecommendationStatus(str, enum.Enum):
    PROPOSED = "PROPOSED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"
