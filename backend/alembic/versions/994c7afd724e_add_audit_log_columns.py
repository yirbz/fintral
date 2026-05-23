"""add_audit_log_columns (visibility, snapshots, request_id)

Revision ID: 994c7afd724e
Revises: 50c279d55c20
Create Date: 2026-05-22 21:43:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "994c7afd724e"
down_revision = "50c279d55c20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "audit_logs",
        sa.Column("visibility", sa.String(10), server_default="'client'", nullable=False),
    )
    op.add_column(
        "audit_logs",
        sa.Column("snapshot_before", sa.JSON(), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("snapshot_after", sa.JSON(), nullable=True),
    )
    op.add_column(
        "audit_logs",
        sa.Column("request_id", sa.String(36), nullable=True),
    )
    op.create_index(op.f("ix_audit_logs_visibility"), "audit_logs", ["visibility"], unique=False)
    op.create_index(op.f("ix_audit_logs_request_id"), "audit_logs", ["request_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_logs_request_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_visibility"), table_name="audit_logs")
    op.drop_column("audit_logs", "request_id")
    op.drop_column("audit_logs", "snapshot_after")
    op.drop_column("audit_logs", "snapshot_before")
    op.drop_column("audit_logs", "visibility")
