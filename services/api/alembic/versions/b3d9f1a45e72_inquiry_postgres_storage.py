"""inquiry postgres storage

Revision ID: b3d9f1a45e72
Revises: a7f3c2e91b04
Create Date: 2026-09-29 12:10:00.000000

Moves anonymous information inquiries off the API host's append-only JSONL file
and into PostgreSQL, where they survive a redeploy and can be queried.

The receipt token is stored only as a SHA-256 hash. The plaintext token is
returned to the submitter exactly once at creation, so a database disclosure
cannot be replayed to read anyone's inquiry. ``client_uuid`` is unique, which is
what makes a queued offline retry idempotent.

Schema only — no rows are inserted here. Existing JSONL inquiries are
intentionally not migrated: they cannot be re-associated with a verifiable
receipt hash, and fabricating one would be worse than leaving them in the file.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b3d9f1a45e72"
down_revision = "a7f3c2e91b04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inquiry",
        sa.Column("client_uuid", sa.String(length=64), nullable=True),
        sa.Column("receipt_token_hash", sa.String(length=64), nullable=False),
        sa.Column("topic", sa.String(length=120), nullable=False),
        sa.Column("crop", sa.String(length=120), nullable=True),
        sa.Column("province", sa.String(length=120), nullable=True),
        sa.Column("district", sa.String(length=120), nullable=True),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("contact_name", sa.String(length=160), nullable=True),
        sa.Column("contact_email", sa.String(length=254), nullable=True),
        sa.Column("organization", sa.String(length=160), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('RECEIVED', 'REVIEWING', 'ANSWERED', 'CLOSED')",
            name="ck_inquiry_status",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("client_uuid", name="uq_inquiry_client_uuid"),
    )
    op.create_index(
        op.f("ix_inquiry_receipt_token_hash"), "inquiry", ["receipt_token_hash"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_inquiry_receipt_token_hash"), table_name="inquiry")
    op.drop_table("inquiry")
