"""Apply missing schema changes from skipped migrations."""
from app.database import get_engine
from sqlalchemy import text

engine = get_engine()

with engine.begin() as conn:
    # 1. Create upload_links table if missing
    r = conn.execute(
        text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='upload_links')")
    )
    if not r.scalar():
        print("Creating upload_links table...")
        conn.execute(text("""
            CREATE TABLE upload_links (
                id UUID PRIMARY KEY,
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                client_email VARCHAR(255) NOT NULL,
                token VARCHAR(100) NOT NULL,
                max_files INTEGER NOT NULL,
                uploaded_count INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL
            )
        """))
        conn.execute(text("CREATE INDEX ix_upload_links_organization_id ON upload_links(organization_id)"))
        conn.execute(text("CREATE INDEX ix_upload_links_tenant_id ON upload_links(tenant_id)"))
        conn.execute(text("CREATE UNIQUE INDEX ix_upload_links_token ON upload_links(token)"))
        print("  done.")

    # 2. Add upload_link_id to pending_uploads
    r = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name='pending_uploads' AND column_name='upload_link_id'")
    )
    if not r.fetchone():
        print("Adding upload_link_id to pending_uploads...")
        conn.execute(text("ALTER TABLE pending_uploads ADD COLUMN upload_link_id UUID REFERENCES upload_links(id) ON DELETE CASCADE"))
        conn.execute(text("CREATE INDEX ix_pending_uploads_upload_link_id ON pending_uploads(upload_link_id)"))
        print("  done.")

    # 3. Add upload_link_id to invoices
    r = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name='upload_link_id'")
    )
    if not r.fetchone():
        print("Adding upload_link_id to invoices...")
        conn.execute(text("ALTER TABLE invoices ADD COLUMN upload_link_id UUID REFERENCES upload_links(id) ON DELETE SET NULL"))
        conn.execute(text("CREATE INDEX ix_invoices_upload_link_id ON invoices(upload_link_id)"))
        print("  done.")

    # 4. Add parent_invoice_id and related columns to invoices
    r = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name='parent_invoice_id'")
    )
    if not r.fetchone():
        print("Adding parent_invoice_id, modified_ncf, modification_reason to invoices...")
        conn.execute(text("ALTER TABLE invoices ADD COLUMN parent_invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT"))
        conn.execute(text("ALTER TABLE invoices ADD COLUMN modified_ncf VARCHAR"))
        conn.execute(text("ALTER TABLE invoices ADD COLUMN modification_reason VARCHAR(50)"))
        conn.execute(text("CREATE INDEX ix_invoices_parent ON invoices(parent_invoice_id)"))
        conn.execute(text("CREATE INDEX ix_invoices_modified_ncf ON invoices(modified_ncf)"))
        print("  done.")

    # 5. Rename ledger_entries credit_note_id -> modificatory_invoice_id
    r = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name='ledger_entries' AND column_name='credit_note_id'")
    )
    if r.fetchone():
        print("Renaming ledger_entries.credit_note_id -> modificatory_invoice_id...")
        conn.execute(text("ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_credit_note_id_fkey"))
        conn.execute(text("ALTER TABLE ledger_entries RENAME COLUMN credit_note_id TO modificatory_invoice_id"))
        conn.execute(text("ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_modificatory_invoice FOREIGN KEY (modificatory_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL"))
        print("  done.")

    # 6. Add currency to ledger_entries if missing
    r = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name='ledger_entries' AND column_name='currency'")
    )
    if not r.fetchone():
        print("Adding currency to ledger_entries...")
        conn.execute(text("ALTER TABLE ledger_entries ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'DOP'"))
        print("  done.")

    print("Schema sync complete.")
