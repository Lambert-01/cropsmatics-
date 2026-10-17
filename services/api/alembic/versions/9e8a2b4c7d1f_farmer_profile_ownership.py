"""make the farmer-profile ownership anchor one-to-one

Revision ID: 9e8a2b4c7d1f
Revises: f1c9d4a7e2b6
Create Date: 2026-10-18 01:20:00.000000

The operational API creates one ``FarmerProfile`` per authenticated user. This
constraint makes that invariant true under concurrent first requests as well as
in application code. It does not make legacy anonymous farm/harvest rows
disappear: those remain nullable and must be backfilled or quarantined through
an explicit data-ownership review.
"""

from __future__ import annotations

from alembic import op

revision = "9e8a2b4c7d1f"
down_revision = "f1c9d4a7e2b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Preflight before applying this migration in production:
    # SELECT user_id, COUNT(*) FROM farmer_profile GROUP BY user_id HAVING COUNT(*) > 1;
    # Resolve duplicate profiles by an owner-approved merge/quarantine first.
    op.create_unique_constraint(
        "uq_farmer_profile_user_id",
        "farmer_profile",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_farmer_profile_user_id", "farmer_profile", type_="unique")
