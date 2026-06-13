"""create_credit_notes_table

Adds the `credit_notes` table (Phase 1 of the credit-notes architecture) and
removes the obsolete `invoices.parent_invoice_id` column.

See docs/plans/credit-notes-architecture.md for the full design.
The credit-notes table is the single source of truth for fiscal credit notes
(B04, E32, and e-CF 34 with IndicadorNotaCredito=1). The pipeline integration
that fills this table from XML/OCR arrives in subsequent phases.

Revision ID: 7b8c9d0e1f2a
Revises: 4ee1914d8429
Create Date: 2026-06-04 21:15:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "7b8c9d0e1f2a"
down_revision: Union[str, Sequence[str], None] = "4ee1914d8429"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Create credit_notes table ──────────────────────────────────────
    op.create_table(
        "credit_notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_id", sa.Uuid(), nullable=True),  # nullable for pending_review
        sa.Column("credit_note_number", sa.String(), nullable=True),
        sa.Column("ecf_type", sa.String(length=2), nullable=True),
        sa.Column("is_electronic", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("credit_note_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ncf_modified", sa.String(), nullable=True),
        sa.Column("modification_reason", sa.String(length=2), nullable=True),
        sa.Column("subtotal", sa.Float(), nullable=True),
        sa.Column("tax_amount", sa.Float(), nullable=True),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="DOP"),
        sa.Column("vendor_name", sa.String(), nullable=True),
        sa.Column("vendor_tax_id", sa.String(), nullable=True),
        sa.Column("vendor_country", sa.String(length=3), nullable=True),
        sa.Column("filename", sa.String(), nullable=True),
        sa.Column("file_path", sa.String(), nullable=True),
        sa.Column("processed_path", sa.String(), nullable=True),
        sa.Column("file_type", sa.String(), nullable=True),
        sa.Column("source_type", sa.String(length=20), nullable=True),
        sa.Column("raw_extracted_data", sa.Text(), nullable=True),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("audit_flags", sa.Text(), nullable=True),
        sa.Column("original_xml_data", sa.Text(), nullable=True),
        sa.Column("quality_report", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="verified"),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("linked_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["deleted_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('pending_review', 'verified', 'rejected', 'voided')",
            name="ck_credit_notes_status",
        ),
    )

    # Performance indexes
    op.create_index("ix_cn_tenant_org", "credit_notes", ["tenant_id", "organization_id"])
    op.create_index("ix_cn_invoice", "credit_notes", ["invoice_id"])
    op.create_index("ix_cn_status", "credit_notes", ["tenant_id", "organization_id", "status"])
    op.create_index("ix_cn_ncf", "credit_notes", ["tenant_id", "organization_id", "credit_note_number"])
    op.create_index("ix_cn_ncf_modified", "credit_notes", ["tenant_id", "organization_id", "ncf_modified"])
    op.create_index(
        "ix_cn_vendor_date",
        "credit_notes",
        ["tenant_id", "organization_id", "vendor_tax_id", "credit_note_date"],
    )
    op.create_index("ix_cn_is_deleted", "credit_notes", ["is_deleted"])
    op.create_index("ix_cn_deleted_at", "credit_notes", ["deleted_at"])

    # Idempotency: same NCF cannot be ingested twice in the same org
    op.create_index(
        "uq_cn_tenant_org_ncf",
        "credit_notes",
        ["tenant_id", "organization_id", "credit_note_number"],
        unique=True,
        postgresql_where=sa.text("credit_note_number IS NOT NULL AND is_deleted = false"),
    )

    # ── 2. Drop the obsolete parent_invoice_id column ────────────────────
    op.execute("ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_parent_invoice_id_fkey")
    op.execute("ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_parent_invoice")
    op.execute("DROP INDEX IF EXISTS ix_invoices_parent_invoice_id")
    op.execute("ALTER TABLE invoices DROP COLUMN IF EXISTS parent_invoice_id")


def downgrade() -> None:
    # ── Restore the obsolete column ───────────────────────────────────────
    op.add_column(
        "invoices",
        sa.Column("parent_invoice_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        "ix_invoices_parent_invoice_id", "invoices", ["parent_invoice_id"]
    )
    op.create_foreign_key(
        "invoices_parent_invoice_id_fkey",
        "invoices",
        "invoices",
        ["parent_invoice_id"],
        ["id"],
        ondelete="NO ACTION",
    )

    # ── Drop the new table and its indexes ───────────────────────────────
    op.drop_index("uq_cn_tenant_org_ncf", table_name="credit_notes")
    op.drop_index("ix_cn_deleted_at", table_name="credit_notes")
    op.drop_index("ix_cn_is_deleted", table_name="credit_notes")
    op.drop_index("ix_cn_vendor_date", table_name="credit_notes")
    op.drop_index("ix_cn_ncf_modified", table_name="credit_notes")
    op.drop_index("ix_cn_ncf", table_name="credit_notes")
    op.drop_index("ix_cn_status", table_name="credit_notes")
    op.drop_index("ix_cn_invoice", table_name="credit_notes")
    op.drop_index("ix_cn_tenant_org", table_name="credit_notes")
    op.drop_table("credit_notes")
