"""add_dgii_validation_columns

Adds dgii_security_code, dgii_validation_status, dgii_validation_date,
and dgii_validation_detail columns to the invoices table for real-time
DGII e-CF validation via ConsultaTimbreFC.

Revision ID: a6102aa346df
Revises: a5102aa346de
Create Date: 2026-06-12 14:15:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "a6102aa346df"
down_revision: Union[str, Sequence[str], None] = "a5102aa346de"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dgii_security_code VARCHAR")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dgii_validation_status VARCHAR(20) NOT NULL DEFAULT 'unchecked'")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dgii_validation_date TIMESTAMP WITH TIME ZONE")
    op.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dgii_validation_detail TEXT")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_dgii_validation_status ON invoices (dgii_validation_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_dgii_validation_date ON invoices (dgii_validation_date)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_invoices_dgii_validation_status")
    op.execute("DROP INDEX IF EXISTS ix_invoices_dgii_validation_date")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS dgii_security_code")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS dgii_validation_status")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS dgii_validation_date")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS dgii_validation_detail")
