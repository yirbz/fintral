"""unify credit/debit notes into invoices table

Adds parent_invoice_id, modified_ncf, modification_reason to invoices,
migrates credit_notes data into invoices, renames ledger FK, drops credit_notes.

Revision ID: a49880f821ec
Revises: a49880f821eb
Create Date: 2026-06-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a49880f821ec"
down_revision: Union[str, None] = "a49880f821eb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # ── 1. Add new columns to invoices ────────────────────────────────────
    op.add_column("invoices", sa.Column("parent_invoice_id", postgresql.UUID(), nullable=True))
    op.add_column("invoices", sa.Column("modified_ncf", sa.String(), nullable=True))
    op.add_column("invoices", sa.Column("modification_reason", sa.String(length=50), nullable=True))
    op.create_index("ix_invoices_parent", "invoices", ["parent_invoice_id"])
    op.create_index("ix_invoices_modified_ncf", "invoices", ["modified_ncf"])
    op.create_foreign_key(
        "fk_invoices_parent_invoice",
        "invoices", "invoices",
        ["parent_invoice_id"], ["id"],
        ondelete="RESTRICT",
    )

    # ── 2. Migrate existing credit_notes into invoices ────────────────────
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, tenant_id, organization_id, invoice_id, "
            "credit_note_number, ecf_type, is_electronic, credit_note_date, "
            "ncf_modified, modification_reason, subtotal, tax_amount, "
            "total_amount, currency, vendor_name, vendor_tax_id, vendor_country, "
            "filename, file_path, processed_path, file_type, source_type, "
            "raw_extracted_data, confidence_score, audit_flags, "
            "original_xml_data, quality_report, status, "
            "created_at, updated_at, created_by, is_deleted, deleted_at "
            "FROM credit_notes"
        )
    ).fetchall()

    for row in rows:
        cn_id = row[0]
        invoice_date_val = row[7]  # credit_note_date
        ecf_type_val = row[5] if row[5] else ("34" if (row[4] or "").startswith(("B04", "E34")) else "33")
        transaction_type = "expense"

        # Derive status
        status = row[27] if row[27] else "draft"
        if status == "verified":
            status = "verified"
        elif status == "pending_review":
            status = "pending_review"

        # Insert into invoices
        conn.execute(
            sa.text(
                "INSERT INTO invoices ("
                "id, tenant_id, organization_id, "
                "parent_invoice_id, modified_ncf, modification_reason, "
                "invoice_number, invoice_date, total_amount, tax_amount, "
                "currency, vendor_name, vendor_tax_id, vendor_country, "
                "filename, file_path, processed_path, file_type, source_type, "
                "raw_extracted_data, confidence_score, audit_flags, "
                "original_xml_data, quality_report, status, transaction_type, "
                "is_electronic, ecf_type, "
                "created_at, updated_at, is_deleted, deleted_at, "
                "processed, line_items_data"
                ") VALUES ("
                ":id, :tenant_id, :organization_id, "
                ":parent_invoice_id, :modified_ncf, :modification_reason, "
                ":invoice_number, :invoice_date, :total_amount, :tax_amount, "
                ":currency, :vendor_name, :vendor_tax_id, :vendor_country, "
                ":filename, :file_path, :processed_path, :file_type, :source_type, "
                ":raw_extracted_data, :confidence_score, :audit_flags, "
                ":original_xml_data, :quality_report, :status, :transaction_type, "
                ":is_electronic, :ecf_type, "
                ":created_at, :updated_at, :is_deleted, :deleted_at, "
                ":processed, :line_items_data"
                ")"
            ),
            {
                "id": row[0],
                "tenant_id": row[1],
                "organization_id": row[2],
                "parent_invoice_id": row[3],
                "modified_ncf": row[8],
                "modification_reason": row[9],
                "invoice_number": row[4],
                "invoice_date": invoice_date_val,
                "total_amount": row[12],
                "tax_amount": row[11],
                "currency": row[13] or "DOP",
                "vendor_name": row[14],
                "vendor_tax_id": row[15],
                "vendor_country": row[16],
                "filename": row[17],
                "file_path": row[18],
                "processed_path": row[19],
                "file_type": row[20],
                "source_type": row[21],
                "raw_extracted_data": row[22],
                "confidence_score": row[23],
                "audit_flags": row[24],
                "original_xml_data": row[25],
                "quality_report": row[26],
                "status": status,
                "transaction_type": transaction_type,
                "is_electronic": True,
                "ecf_type": ecf_type_val,
                "created_at": row[28],
                "updated_at": row[29],
                "is_deleted": row[31] or False,
                "deleted_at": row[32],
                "processed": True,
                "line_items_data": None,
            },
        )

    # ── 3. Update ledger_entries: rename credit_note_id and drop FK ────────
    op.drop_constraint("ledger_entries_credit_note_id_fkey", "ledger_entries", type_="foreignkey")
    op.alter_column("ledger_entries", "credit_note_id", new_column_name="modificatory_invoice_id")
    op.create_foreign_key(
        "fk_ledger_modificatory_invoice",
        "ledger_entries", "invoices",
        ["modificatory_invoice_id"], ["id"],
        ondelete="SET NULL",
    )

    # ── 4. Drop credit_notes table ────────────────────────────────────────
    op.drop_table("credit_notes")


def downgrade():
    # ── Reverse: recreate credit_notes table ──────────────────────────────
    op.create_table(
        "credit_notes",
        sa.Column("id", postgresql.UUID(), autoincrement=False, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(), autoincrement=False, nullable=False),
        sa.Column("organization_id", postgresql.UUID(), autoincrement=False, nullable=False),
        sa.Column("invoice_id", postgresql.UUID(), autoincrement=False, nullable=True),
        sa.Column("credit_note_number", sa.String(), autoincrement=False, nullable=True),
        sa.Column("ecf_type", sa.String(length=2), autoincrement=False, nullable=True),
        sa.Column("is_electronic", sa.Boolean(), autoincrement=False, nullable=False),
        sa.Column("credit_note_date", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
        sa.Column("ncf_modified", sa.String(), autoincrement=False, nullable=True),
        sa.Column("modification_reason", sa.String(length=2), autoincrement=False, nullable=True),
        sa.Column("subtotal", sa.Float(), autoincrement=False, nullable=True),
        sa.Column("tax_amount", sa.Float(), autoincrement=False, nullable=True),
        sa.Column("total_amount", sa.Float(), autoincrement=False, nullable=False),
        sa.Column("currency", sa.String(), autoincrement=False, nullable=False),
        sa.Column("vendor_name", sa.String(), autoincrement=False, nullable=True),
        sa.Column("vendor_tax_id", sa.String(), autoincrement=False, nullable=True),
        sa.Column("vendor_country", sa.String(length=3), autoincrement=False, nullable=True),
        sa.Column("filename", sa.String(), autoincrement=False, nullable=True),
        sa.Column("file_path", sa.String(), autoincrement=False, nullable=True),
        sa.Column("processed_path", sa.String(), autoincrement=False, nullable=True),
        sa.Column("file_type", sa.String(), autoincrement=False, nullable=True),
        sa.Column("source_type", sa.String(length=20), autoincrement=False, nullable=True),
        sa.Column("raw_extracted_data", sa.Text(), autoincrement=False, nullable=True),
        sa.Column("confidence_score", sa.Float(), autoincrement=False, nullable=True),
        sa.Column("audit_flags", sa.Text(), autoincrement=False, nullable=True),
        sa.Column("original_xml_data", sa.Text(), autoincrement=False, nullable=True),
        sa.Column("quality_report", sa.Text(), autoincrement=False, nullable=True),
        sa.Column("status", sa.String(length=20), autoincrement=False, nullable=False),
        sa.Column("review_notes", sa.Text(), autoincrement=False, nullable=True),
        sa.Column("linked_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
        sa.Column("linked_by", postgresql.UUID(), autoincrement=False, nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
        sa.Column("created_by", postgresql.UUID(), autoincrement=False, nullable=True),
        sa.Column("is_deleted", sa.Boolean(), autoincrement=False, nullable=False),
        sa.Column("deleted_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
        sa.Column("deleted_by", postgresql.UUID(), autoincrement=False, nullable=True),
        sa.PrimaryKeyConstraint("id", name="credit_notes_pkey"),
        sa.UniqueConstraint("id"),
    )
    op.create_index("ix_cn_tenant_org", "credit_notes", ["tenant_id", "organization_id"])
    op.create_index("ix_cn_invoice", "credit_notes", ["invoice_id"])
    op.create_index("ix_cn_ncf_modified", "credit_notes", ["tenant_id", "organization_id", "ncf_modified"])

    # Move Invoice records back to credit_notes (ecf_type 33/34 or B03/B04/E33/E34 prefix)
    conn = op.get_bind()
    inv_rows = conn.execute(
        sa.text(
            "SELECT id, tenant_id, organization_id, parent_invoice_id, "
            "invoice_number, ecf_type, is_electronic, invoice_date, "
            "modified_ncf, modification_reason, total_amount, tax_amount, "
            "currency, vendor_name, vendor_tax_id, vendor_country, "
            "filename, file_path, processed_path, file_type, source_type, "
            "raw_extracted_data, confidence_score, audit_flags, "
            "original_xml_data, quality_report, status, "
            "created_at, updated_at, is_deleted, deleted_at "
            "FROM invoices "
            "WHERE ecf_type IN ('33', '34') "
            "OR invoice_number LIKE 'B03%' OR invoice_number LIKE 'B04%' "
            "OR invoice_number LIKE 'E33%' OR invoice_number LIKE 'E34%'"
        )
    ).fetchall()

    for row in inv_rows:
        conn.execute(
            sa.text(
                "INSERT INTO credit_notes ("
                "id, tenant_id, organization_id, invoice_id, "
                "credit_note_number, ecf_type, is_electronic, credit_note_date, "
                "ncf_modified, modification_reason, subtotal, tax_amount, "
                "total_amount, currency, vendor_name, vendor_tax_id, vendor_country, "
                "filename, file_path, processed_path, file_type, source_type, "
                "raw_extracted_data, confidence_score, audit_flags, "
                "original_xml_data, quality_report, status, "
                "created_at, updated_at, is_deleted, deleted_at "
                ") VALUES ("
                ":id, :tenant_id, :organization_id, :invoice_id, "
                ":credit_note_number, :ecf_type, :is_electronic, :credit_note_date, "
                ":ncf_modified, :modification_reason, :subtotal, :tax_amount, "
                ":total_amount, :currency, :vendor_name, :vendor_tax_id, :vendor_country, "
                ":filename, :file_path, :processed_path, :file_type, :source_type, "
                ":raw_extracted_data, :confidence_score, :audit_flags, "
                ":original_xml_data, :quality_report, :status, "
                ":created_at, :updated_at, :is_deleted, :deleted_at "
                ")"
            ),
            {
                "id": row[0],
                "tenant_id": row[1],
                "organization_id": row[2],
                "invoice_id": row[3],
                "credit_note_number": row[4],
                "ecf_type": row[5],
                "is_electronic": row[6],
                "credit_note_date": row[7],
                "ncf_modified": row[8],
                "modification_reason": row[9],
                "subtotal": None,
                "tax_amount": row[11],
                "total_amount": row[10],
                "currency": row[12],
                "vendor_name": row[13],
                "vendor_tax_id": row[14],
                "vendor_country": row[15],
                "filename": row[16],
                "file_path": row[17],
                "processed_path": row[18],
                "file_type": row[19],
                "source_type": row[20],
                "raw_extracted_data": row[21],
                "confidence_score": row[22],
                "audit_flags": row[23],
                "original_xml_data": row[24],
                "quality_report": row[25],
                "status": row[26] if row[26] else "verified",
                "created_at": row[27],
                "updated_at": row[28],
                "is_deleted": row[29] or False,
                "deleted_at": row[30],
            },
        )

    # ── Revert ledger_entries ─────────────────────────────────────────────
    op.drop_constraint("fk_ledger_modificatory_invoice", "ledger_entries", type_="foreignkey")
    op.alter_column("ledger_entries", "modificatory_invoice_id", new_column_name="credit_note_id")
    op.create_foreign_key(
        "ledger_entries_credit_note_id_fkey",
        "ledger_entries", "credit_notes",
        ["credit_note_id"], ["id"],
        ondelete="SET NULL",
    )

    # ── Remove new columns from invoices ──────────────────────────────────
    op.drop_constraint("fk_invoices_parent_invoice", "invoices", type_="foreignkey")
    op.drop_index("ix_invoices_modified_ncf", table_name="invoices")
    op.drop_index("ix_invoices_parent", table_name="invoices")
    op.drop_column("invoices", "modification_reason")
    op.drop_column("invoices", "modified_ncf")
    op.drop_column("invoices", "parent_invoice_id")
