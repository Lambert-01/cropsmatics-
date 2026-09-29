"""unit-aware observation bounds

Revision ID: c81e4a2d97f0
Revises: b3d9f1a45e72
Create Date: 2026-09-29 14:35:00.000000

Replaces the generic `value <= 100 * 1000` bound on `agricultural_observation`
with a simple non-negative constraint.

The old rule was wrong, not merely tight: it rejected a real published figure
(102,013 ha of agroforestry in a district), so a canonical load would have failed
on legitimate source data. A percentage needs a ceiling of 100, but a hectare
total does not - and PostgreSQL does not allow a CHECK constraint to join `unit`
in order to tell them apart.

The unit-aware bound therefore lives where the unit is known: the loader checks
each observation against its indicator's unit dimension before writing, and
rejects a share above 100 or any negative quantity with a recorded reason. The
database keeps the invariant it can express - nothing negative.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c81e4a2d97f0"
down_revision = "b3d9f1a45e72"
branch_labels = None
depends_on = None

TABLE = "agricultural_observation"


def upgrade() -> None:
    op.drop_constraint(
        "ck_agricultural_observation_value_bound", TABLE, type_="check"
    )
    op.create_check_constraint(
        "ck_agricultural_observation_value_non_negative",
        TABLE,
        "value IS NULL OR value >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_agricultural_observation_value_non_negative", TABLE, type_="check"
    )
    op.create_check_constraint(
        "ck_agricultural_observation_value_bound",
        TABLE,
        sa.text("value IS NULL OR value <= 100 * 1000"),
    )
