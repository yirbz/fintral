"""Add remaining missing columns to invoices."""
from app.database import get_engine
from sqlalchemy import text

engine = get_engine()

with engine.begin() as conn:
    # Check and add modified_ncf
    r = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name='modified_ncf'")
    )
    if not r.fetchone():
        print("Adding modified_ncf to invoices...")
        conn.execute(text("ALTER TABLE invoices ADD COLUMN modified_ncf VARCHAR"))
        conn.execute(text("CREATE INDEX ix_invoices_modified_ncf ON invoices(modified_ncf)"))
        print("  done.")

    # Check and add modification_reason
    r = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name='modification_reason'")
    )
    if not r.fetchone():
        print("Adding modification_reason to invoices...")
        conn.execute(text("ALTER TABLE invoices ADD COLUMN modification_reason VARCHAR(50)"))
        print("  done.")

    print("Remaining columns added.")
