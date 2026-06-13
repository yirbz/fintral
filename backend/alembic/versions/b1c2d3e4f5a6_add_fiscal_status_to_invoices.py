"""add fiscal_status fields to invoices

Adds fiscal_status, fiscal_period_override, and fiscal_exclusion_reason
columns to the invoices table for fiscal conciliation workflow.

Revision ID: b1c2d3e4f5a6
Revises: a6102aa346df
Create Date: 2026-06-12 15:45:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a6102aa346df"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fiscal_status "
        "VARCHAR(20) NOT NULL DEFAULT 'pending_review'"
    )
    op.execute(
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fiscal_period_override "
        "VARCHAR(6)"
    )
    op.execute(
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fiscal_exclusion_reason "
        "VARCHAR(100)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_invoices_fiscal_status "
        "ON invoices (fiscal_status)"
    )

    # Data migration: populate fiscal_status from existing dgii_validation_status
    op.execute(
        "UPDATE invoices SET fiscal_status = 'valid' "
        "WHERE dgii_validation_status = 'accepted'"
    )
    op.execute(
        "UPDATE invoices SET fiscal_status = 'invalid' "
        "WHERE dgii_validation_status IN ('rejected', 'not_found', 'error')"
    )
    op.execute(
        "UPDATE invoices SET fiscal_status = 'pending_review' "
        "WHERE dgii_validation_status = 'unchecked' "
        "AND invoice_number IS NOT NULL AND invoice_number != ''"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_invoices_fiscal_status")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS fiscal_exclusion_reason")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS fiscal_period_override")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS fiscal_status")
