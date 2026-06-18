"""add_audit_log_columns (visibility, snapshots, request_id)

Revision ID: 994c7afd724e
Revises: 50c279d55c20
Create Date: 2026-05-22 21:43:00.000000

"""

from alembic import op


revision = "994c7afd724e"
down_revision = "50c279d55c20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS: columns may already exist if initial_schema was regenerated
    op.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'client'")
    op.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS snapshot_before JSON")
    op.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS snapshot_after JSON")
    op.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_id VARCHAR(36)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_visibility ON audit_logs (visibility)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_request_id ON audit_logs (request_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_request_id")
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_visibility")
    op.execute("ALTER TABLE audit_logs DROP COLUMN IF EXISTS request_id")
    op.execute("ALTER TABLE audit_logs DROP COLUMN IF EXISTS snapshot_after")
    op.execute("ALTER TABLE audit_logs DROP COLUMN IF EXISTS snapshot_before")
    op.execute("ALTER TABLE audit_logs DROP COLUMN IF EXISTS visibility")
