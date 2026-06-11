"""create_ledger_entries_table

Adds the ledger_entries table for payment tracking and credit-note
reversals. Handles the case where the table was pre-created by
bootstrap's create_all fallback (possibly with a stale schema
missing newer columns like credit_note_id, reversal_of, is_reversal).

Revision ID: f8a1b2c3d4e5
Revises: 7b8c9d0e1f2a
Create Date: 2026-06-05 20:45:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "f8a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "7b8c9d0e1f2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS ledger_entries (
            id UUID NOT NULL,
            tenant_id UUID NOT NULL,
            organization_id UUID NOT NULL,
            invoice_id UUID,
            credit_note_id UUID,
            entry_type VARCHAR(20) DEFAULT 'credit' NOT NULL,
            amount NUMERIC(14, 2) DEFAULT 0.00 NOT NULL,
            currency VARCHAR(3) DEFAULT 'DOP' NOT NULL,
            description TEXT,
            reversal_of UUID,
            is_reversal BOOLEAN DEFAULT false NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            created_by UUID,
            PRIMARY KEY (id),
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
            FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
            FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE SET NULL,
            FOREIGN KEY (reversal_of) REFERENCES ledger_entries(id) ON DELETE SET NULL
        )
    """)
    op.execute("ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS credit_note_id UUID")
    op.execute("ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS reversal_of UUID")
    op.execute("ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS created_by UUID")
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_entries_credit_note_id_fkey') THEN
                ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_credit_note_id_fkey
                    FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE SET NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ledger_entries_reversal_of_fkey') THEN
                ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_reversal_of_fkey
                    FOREIGN KEY (reversal_of) REFERENCES ledger_entries(id) ON DELETE SET NULL;
            END IF;
        END $$;
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_le_tenant_org ON ledger_entries (tenant_id, organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_le_invoice ON ledger_entries (invoice_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_le_credit_note ON ledger_entries (credit_note_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_le_reversal_of ON ledger_entries (reversal_of)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ledger_entries CASCADE")
