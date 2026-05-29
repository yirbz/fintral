"""add deleted_at to tenants, users, organizations

Revision ID: 9f0e1d2c3b4a
Revises: 9748c57246f4
Create Date: 2026-05-28 14:35:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9f0e1d2c3b4a"
down_revision: Union[str, None] = "9748c57246f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tenants_deleted_at ON tenants (deleted_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_deleted_at ON users (deleted_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_organizations_deleted_at ON organizations (deleted_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_tenants_deleted_at")
    op.execute("DROP INDEX IF EXISTS ix_users_deleted_at")
    op.execute("DROP INDEX IF EXISTS ix_organizations_deleted_at")
    op.drop_column("tenants", "deleted_at")
    op.drop_column("users", "deleted_at")
    op.drop_column("organizations", "deleted_at")
