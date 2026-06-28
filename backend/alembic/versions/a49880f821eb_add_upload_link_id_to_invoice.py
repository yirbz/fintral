"""add_upload_link_id_to_invoice

Revision ID: a49880f821eb
Revises: 465d130b62a0
Create Date: 2026-06-06 13:45:27.115135

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a49880f821eb'
down_revision: Union[str, Sequence[str], None] = '465d130b62a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS upload_link_id UUID")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_upload_link_id ON invoices (upload_link_id)")
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'invoices'::regclass
                AND conname = 'fk_invoices_upload_link_id'
            ) THEN
                ALTER TABLE invoices
                ADD CONSTRAINT fk_invoices_upload_link_id
                FOREIGN KEY (upload_link_id) REFERENCES upload_links(id) ON DELETE SET NULL;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_upload_link_id")
    op.execute("DROP INDEX IF EXISTS ix_invoices_upload_link_id")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS upload_link_id")
