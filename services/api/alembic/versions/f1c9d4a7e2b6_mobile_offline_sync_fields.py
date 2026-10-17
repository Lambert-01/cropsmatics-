"""mobile offline sync fields

Revision ID: f1c9d4a7e2b6
Revises: d4b7c1e85a23
Create Date: 2026-10-17 10:00:00.000000

Adds the offline-first fields the mobile queue already captures but could not
store, and the farm-profile upload that queue was missing.

``harvest_registration`` gains the rest of the field record (window, location,
notes, storage-assistance flag) plus ``farm_client_uuid``: the farm link is
keyed by the *client's* UUID so it survives either upload arriving first -
``create_harvest`` links when the farm is already present, the new farm route
back-fills the rest.

``farm`` gains the client idempotency key and the denormalized district/sector
names (same pattern as ``harvest_registration``), and ``farm.farmer_id`` becomes
nullable: a profile captured in the field exists before any account does.

All additions are nullable (or defaulted), so existing rows need no backfill.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f1c9d4a7e2b6"
down_revision = "d4b7c1e85a23"
branch_labels = None
depends_on = None

HARVEST = "harvest_registration"
FARM = "farm"


def upgrade() -> None:
    op.add_column(HARVEST, sa.Column("harvest_start_date", sa.Date(), nullable=True))
    op.add_column(HARVEST, sa.Column("harvest_end_date", sa.Date(), nullable=True))
    op.add_column(HARVEST, sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column(HARVEST, sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column(HARVEST, sa.Column("notes", sa.Text(), nullable=True))
    op.add_column(
        HARVEST,
        sa.Column(
            "needs_storage_assistance",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(HARVEST, sa.Column("farm_client_uuid", sa.String(length=64), nullable=True))
    op.create_index(
        op.f("ix_harvest_registration_farm_client_uuid"),
        HARVEST,
        ["farm_client_uuid"],
        unique=False,
    )

    op.add_column(FARM, sa.Column("client_uuid", sa.String(length=64), nullable=True))
    op.add_column(FARM, sa.Column("district_name", sa.String(length=64), nullable=True))
    op.add_column(FARM, sa.Column("sector_name", sa.String(length=64), nullable=True))
    op.add_column(FARM, sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column(FARM, sa.Column("longitude", sa.Float(), nullable=True))
    op.create_index(op.f("ix_farm_client_uuid"), FARM, ["client_uuid"], unique=True)
    op.create_index(op.f("ix_farm_district_name"), FARM, ["district_name"], unique=False)
    op.alter_column(FARM, "farmer_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    # A downgrade must never silently orphan or delete operational records. A
    # real rollback is blocked until an operator has reassigned every anonymous
    # profile; the check runs before any destructive DDL.
    bind = op.get_bind()
    anonymous = bind.execute(
        sa.text("SELECT COUNT(*) FROM farm WHERE farmer_id IS NULL")
    ).scalar_one()
    if anonymous:
        raise RuntimeError(
            "cannot downgrade mobile sync fields while farm rows have no farmer_id; "
            "reassign or quarantine those rows first"
        )
    op.alter_column(FARM, "farmer_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_index(op.f("ix_farm_district_name"), table_name=FARM)
    op.drop_index(op.f("ix_farm_client_uuid"), table_name=FARM)
    op.drop_column(FARM, "longitude")
    op.drop_column(FARM, "latitude")
    op.drop_column(FARM, "sector_name")
    op.drop_column(FARM, "district_name")
    op.drop_column(FARM, "client_uuid")

    op.drop_index(op.f("ix_harvest_registration_farm_client_uuid"), table_name=HARVEST)
    op.drop_column(HARVEST, "farm_client_uuid")
    op.drop_column(HARVEST, "needs_storage_assistance")
    op.drop_column(HARVEST, "notes")
    op.drop_column(HARVEST, "longitude")
    op.drop_column(HARVEST, "latitude")
    op.drop_column(HARVEST, "harvest_end_date")
    op.drop_column(HARVEST, "harvest_start_date")
