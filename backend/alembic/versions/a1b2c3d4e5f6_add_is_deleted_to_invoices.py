"""add_is_deleted_to_invoices

Revision ID: a1b2c3d4e5f6
Revises: e76f5b7bbbee
Create Date: 2026-06-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'e76f5b7bbbee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_name = 'invoices' AND column_name = 'is_deleted'
            ) THEN
                ALTER TABLE invoices ADD COLUMN is_deleted BOOLEAN DEFAULT false NOT NULL;
            END IF;
        END $$;
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_is_deleted ON invoices (is_deleted)")
    op.execute("UPDATE invoices SET is_deleted = true WHERE deleted_at IS NOT NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS ix_invoices_is_deleted")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS is_deleted")
