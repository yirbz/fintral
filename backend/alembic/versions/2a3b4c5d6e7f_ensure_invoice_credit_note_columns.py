"""ensure parent_invoice_id, modified_ncf, modification_reason exist on invoices

Idempotent fix for staging where migration a49880f821ec was skipped,
leaving these columns absent and causing 500s on invoice queries.

Revision ID: 2a3b4c5d6e7f
Revises: 5a6b7c8d9e0f
Create Date: 2026-07-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import app.database


revision: str = "2a3b4c5d6e7f"
down_revision: Union[str, None] = "5a6b7c8d9e0f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    table_names = insp.get_table_names()
    if "invoices" not in table_names:
        op.create_table(
            "invoices",
            sa.Column("id", app.database.GUID, primary_key=True),
            sa.Column("parent_invoice_id", app.database.GUID, nullable=True),
            sa.Column("modified_ncf", sa.String, nullable=True),
            sa.Column("modification_reason", sa.String(50), nullable=True),
        )
        return

    existing_cols = {c["name"] for c in insp.get_columns("invoices")}

    if "parent_invoice_id" not in existing_cols:
        op.execute("ALTER TABLE invoices ADD COLUMN parent_invoice_id UUID")

    if "modified_ncf" not in existing_cols:
        op.execute("ALTER TABLE invoices ADD COLUMN modified_ncf VARCHAR")

    if "modification_reason" not in existing_cols:
        op.execute("ALTER TABLE invoices ADD COLUMN modification_reason VARCHAR(50)")

    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_parent ON invoices (parent_invoice_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_invoices_modified_ncf ON invoices (modified_ncf)")

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_invoices_parent_invoice'
            ) THEN
                ALTER TABLE invoices ADD CONSTRAINT fk_invoices_parent_invoice
                    FOREIGN KEY (parent_invoice_id) REFERENCES invoices (id) ON DELETE RESTRICT;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_parent_invoice")
    op.execute("DROP INDEX IF EXISTS ix_invoices_modified_ncf")
    op.execute("DROP INDEX IF EXISTS ix_invoices_parent")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS parent_invoice_id")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS modified_ncf")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS modification_reason")
