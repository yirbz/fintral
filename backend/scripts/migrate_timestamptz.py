"""
Migration: Convert all naive DateTime columns to TIMESTAMPTZ.

PostgreSQL stores `DateTime` as `timestamp without time zone` and
`DateTime(timezone=True)` as `timestamp with time zone`.

This migration converts all existing `timestamp without time zone` columns
to `timestamp with time zone`, interpreting existing values as UTC.

Run:  python scripts/migrate_timestamptz.py
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import get_engine
from app.config import DATABASE_URL
from sqlalchemy import text

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

TABLES = {
    "invoices": ["invoice_date", "created_at", "updated_at", "deleted_at"],
    "users": ["created_at"],
    "user_organizations": ["created_at"],
    "organizations": ["created_at", "updated_at"],
    "tenants": ["created_at", "updated_at"],
    "settings": ["updated_at"],
    "user_settings": ["updated_at"],
    "notifications": ["created_at"],
    "webhook_endpoints": ["created_at"],
    "reference_data": ["created_at", "updated_at"],
}


def run():
    if not DATABASE_URL.startswith("postgresql"):
        logger.warning("Not a PostgreSQL database — migration skipped (use SQLite for dev/tests only)")
        return

    engine = get_engine()
    conn = engine.connect()
    tx = conn.begin()
    try:
        for table, columns in TABLES.items():
            for col in columns:
                sql = text(f'ALTER TABLE "{table}" ALTER COLUMN "{col}" TYPE timestamptz USING "{col}" AT TIME ZONE \'UTC\';')
                logger.info("  %s.%s → timestamptz", table, col)
                conn.execute(sql)
        tx.commit()
        logger.info("\n✅ All columns migrated to TIMESTAMPTZ (UTC).")
    except Exception as e:
        tx.rollback()
        logger.error("\n❌ Migration failed: %s", e)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
