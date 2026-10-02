"""source table granularity

Revision ID: d4b7c1e85a23
Revises: c81e4a2d97f0
Create Date: 2026-09-29 15:05:00.000000

Adds ``source_table.granularity``.

Normalized observations previously carried ``source_table_id = NULL`` while the
productivity panel carried a real worksheet id, so provenance depth differed by
domain for no stated reason. Attributing an observation honestly needs a way to
say *which granularity* the attribution has: some extracts name one published
table ("NISR SAS 2025 Season B - Table 14"), others name several
("... - Tables 30-31"), and one names none. A worksheet row and a release-level
row are now distinguishable instead of relying on a NULL sheet to mean both.

Existing rows are worksheet-level, which is what the backfill default records.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d4b7c1e85a23"
down_revision = "c81e4a2d97f0"
branch_labels = None
depends_on = None

TABLE = "source_table"


def upgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column(
            "granularity",
            sa.String(length=16),
            nullable=False,
            server_default="worksheet",
        ),
    )
    op.create_check_constraint(
        "ck_source_table_granularity",
        TABLE,
        "granularity IN ('worksheet', 'dataset')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_source_table_granularity", TABLE, type_="check")
    op.drop_column(TABLE, "granularity")
