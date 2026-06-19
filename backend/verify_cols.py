"""Verify columns exist."""
from app.database import get_engine
from sqlalchemy import text

engine = get_engine()
with engine.connect() as conn:
    r = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name='pending_uploads' ORDER BY ordinal_position")
    )
    cols = [row[0] for row in r]
    print(f"pending_uploads: {cols}")
    print(f"  has upload_link_id: {'upload_link_id' in cols}")
    
    r = conn.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name='upload_link_id'")
    )
    print(f"  invoices has upload_link_id: {r.fetchone() is not None}")
    
    r = conn.execute(
        text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name='upload_links')")
    )
    print(f"  upload_links table exists: {r.scalar()}")
