"""All ORM models.

Importing this package registers every table on ``Base.metadata`` (used by
Alembic autogenerate and ``app.db.init_db``).
"""

from app.db.base import Base
from app.models.analytics import (
    InterventionPriority,
    ModelVersion,
    OfficialIndicator,
    ProductivityGap,
    ProductivityMetric,
)
from app.models.crop import Crop
from app.models.enums import (
    FacilityType,
    PriorityBand,
    RecommendationStatus,
    RiskBand,
    RoleName,
    SyncStatus,
    VerificationStatus,
)
from app.models.facility import Facility, FacilityCapacitySnapshot
from app.models.farm import Cooperative, FarmerProfile, Farm
from app.models.geography import District, Province, Sector
from app.models.harvest import HarvestRegistration, RiskScore
from app.models.market import MarketPrice, Notification, Recommendation
from app.models.ops import (
    AuditLog,
    DataSource,
    FieldObservation,
    SyncEvent,
    VerificationTask,
)
from app.models.user import Role, User, UserRole

__all__ = [
    "Base",
    # geography
    "Province",
    "District",
    "Sector",
    # reference
    "Crop",
    # identity
    "User",
    "Role",
    "UserRole",
    # farmer
    "Cooperative",
    "FarmerProfile",
    "Farm",
    # harvest
    "HarvestRegistration",
    "RiskScore",
    # facility
    "Facility",
    "FacilityCapacitySnapshot",
    # analytics
    "OfficialIndicator",
    "ProductivityMetric",
    "ProductivityGap",
    "InterventionPriority",
    "ModelVersion",
    # market
    "MarketPrice",
    "Recommendation",
    "Notification",
    # ops
    "FieldObservation",
    "VerificationTask",
    "SyncEvent",
    "DataSource",
    "AuditLog",
    # enums
    "RoleName",
    "RiskBand",
    "PriorityBand",
    "VerificationStatus",
    "FacilityType",
    "SyncStatus",
    "RecommendationStatus",
]
