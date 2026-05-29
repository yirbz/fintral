"""add_hybrid_ingestion_layer_fields

Revision ID: 4064f55f9792
Revises: 3a1b2c3d4e5f
Create Date: 2026-05-24 13:47:55.654869

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import app

revision: str = '4064f55f9792'
down_revision: Union[str, Sequence[str], None] = '3a1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rnc_comprador VARCHAR")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_electronic BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ingestion_source VARCHAR(20)")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft'")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_invoice_id UUID")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS accounting_account_id VARCHAR")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cost_center_id VARCHAR")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tags TEXT")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_notes TEXT")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_parent_invoice_id ON invoices (parent_invoice_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_status ON invoices (status)")
    op.execute("ALTER TABLE invoices ADD CONSTRAINT fk_invoices_parent_invoice FOREIGN KEY (parent_invoice_id) REFERENCES invoices (id)")


def downgrade() -> None:
    op.execute("ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_parent_invoice")
    op.execute("DROP INDEX IF EXISTS ix_invoices_status")
    op.execute("DROP INDEX IF EXISTS ix_invoices_parent_invoice_id")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS payment_status")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS internal_notes")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS tags")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS cost_center_id")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS accounting_account_id")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS parent_invoice_id")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS status")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS ingestion_source")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS is_electronic")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS rnc_comprador")
