"""Apply missing schema changes in separate transactions."""
from app.database import get_engine
from sqlalchemy import text

engine = get_engine()

def col_exists(table, col):
    with engine.connect() as conn:
        r = conn.execute(
            text(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}' AND column_name='{col}'")
        )
        return r.fetchone() is not None

def table_exists(name):
    with engine.connect() as conn:
        r = conn.execute(
            text(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='{name}')")
        )
        return r.scalar()

# Step 1: Create upload_links table (own transaction)
if not table_exists("upload_links"):
    print("Creating upload_links table...")
    with engine.begin() as conn:
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

# Step 2: Add upload_link_id to pending_uploads (own transaction)
if not col_exists("pending_uploads", "upload_link_id"):
    print("Adding upload_link_id to pending_uploads...")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE pending_uploads ADD COLUMN upload_link_id UUID REFERENCES upload_links(id) ON DELETE CASCADE"))
        conn.execute(text("CREATE INDEX ix_pending_uploads_upload_link_id ON pending_uploads(upload_link_id)"))
    print("  done.")

# Step 3: Add upload_link_id to invoices (own transaction)
if not col_exists("invoices", "upload_link_id"):
    print("Adding upload_link_id to invoices...")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE invoices ADD COLUMN upload_link_id UUID REFERENCES upload_links(id) ON DELETE SET NULL"))
        conn.execute(text("CREATE INDEX ix_invoices_upload_link_id ON invoices(upload_link_id)"))
    print("  done.")

# Step 4: Add modified_ncf and modification_reason (own transaction)
if not col_exists("invoices", "modified_ncf"):
    print("Adding modified_ncf to invoices...")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE invoices ADD COLUMN modified_ncf VARCHAR"))
        conn.execute(text("CREATE INDEX ix_invoices_modified_ncf ON invoices(modified_ncf)"))
    print("  done.")

if not col_exists("invoices", "modification_reason"):
    print("Adding modification_reason to invoices...")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE invoices ADD COLUMN modification_reason VARCHAR(50)"))
    print("  done.")

print("Schema sync complete.")
