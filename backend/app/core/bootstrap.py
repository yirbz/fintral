import asyncio
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import ADMIN_EMAIL, ADMIN_FULL_NAME, ADMIN_PASSWORD, DISABLE_HEARTBEAT_TASK, IS_PRODUCTION
from app.core.auth import get_password_hash
from app.core.logging import setup_logging
from app.dependencies.tenancy import get_default_org, get_default_tenant
from app.models import User, UserOrganization
from app.services.auth_service import create_admin_user
from app.services.supabase_storage import (
    INVOICES_PREFIX,
    delete_file as supabase_delete,
    delete_invoice_folder,
)
from app.services.websocket import start_heartbeat_task

logger = setup_logging()


def init_database() -> None:
    import time

    from alembic import command
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import inspect, text

    from app.database import Base, engine

    if engine is None:
        logger.warning("init_database — engine not available, skipping")
        return

    t0 = time.time()
    alembic_cfg = Config("alembic.ini")
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    has_alembic_version = "alembic_version" in tables
    has_data_tables = "invoices" in tables
    logger.info("init_database — has_alembic_version=%s has_data_tables=%s tables=%d (%.2fs)",
                has_alembic_version, has_data_tables, len(tables), time.time() - t0)

    if has_alembic_version:
        with engine.connect() as conn:
            row = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        script = ScriptDirectory.from_config(alembic_cfg)
        head_rev = script.get_current_head()
        logger.info("alembic_version=%s head=%s match=%s", row, head_rev, row == head_rev)
        if row == head_rev:
            logger.info("Already at head revision — skipping alembic upgrade")
            return

        db_rev_exists = row in [r.revision for r in script.walk_revisions()]
        if not db_rev_exists and has_data_tables:
            base_rev = script.get_base()
            logger.warning("Current alembic_version=%s not found in migration scripts — "
                           "likely the initial migration was regenerated. "
                           "Stamping to base (%s) via SQL, then running pending migrations.",
                           row, base_rev)
            with engine.connect() as conn:
                conn.execute(text("UPDATE alembic_version SET version_num = :base"), {"base": base_rev})
                conn.commit()
            logger.info("Updated alembic_version from %s to %s", row, base_rev)
            # Fall through to run pending migrations below

        t1 = time.time()
        logger.info("Running pending migrations from %s to %s ...", row, head_rev)
        try:
            command.upgrade(alembic_cfg, "head")
            logger.info("Alembic migrations applied (%.2fs)", time.time() - t1)
        except Exception as e:
            logger.error("Alembic upgrade failed (%s) after %.2fs: %s",
                         type(e).__name__, time.time() - t1, e)
            raise
        return

    if has_data_tables:
        t1 = time.time()
        logger.info("Existing DB without alembic_version — stamping head")
        command.stamp(alembic_cfg, "head")
        logger.info("Alembic stamp successful (%.2fs)", time.time() - t1)
        return

    logger.info("Fresh database — creating all tables via Alembic")
    t1 = time.time()
    try:
        command.upgrade(alembic_cfg, "head")
        logger.info("Database tables created (%.2fs)", time.time() - t1)
    except Exception as e:
        logger.warning("Alembic upgrade failed (%s) — falling back to create_all (%.2fs): %s",
                       type(e).__name__, time.time() - t1, e)
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("create_all fallback done")
        except Exception as ca_err:
            logger.warning("create_all also failed: %s", ca_err)


def ensure_default_admin(db: Session) -> None:
    from app.database import engine

    if engine is None:
        logger.warning("ensure_default_admin — database not available, skipping admin creation")
        return

    if not ADMIN_EMAIL:
        raise RuntimeError("ADMIN_EMAIL is not set. This is required to bootstrap the system.")

    existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if existing:
        logger.info("Admin user already exists in database: %s", ADMIN_EMAIL)
        return

    if not ADMIN_PASSWORD:
        raise RuntimeError("ADMIN_PASSWORD is not set. This is required to bootstrap the system.")

    supabase_uid = None
    if IS_PRODUCTION:
        supabase_result = create_admin_user(ADMIN_EMAIL, ADMIN_PASSWORD)
        if supabase_result:
            supabase_uid = supabase_result["id"]
            logger.info("Admin user created in Supabase Auth: %s (id=%s)", ADMIN_EMAIL, supabase_uid)
        else:
            logger.warning("Supabase Auth admin creation failed for %s — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", ADMIN_EMAIL)

    tenant = get_default_tenant(db)
    org = get_default_org(db, tenant.id)

    password = ADMIN_PASSWORD
    if len(password.encode("utf-8")) > 72:
        password = password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
        logger.warning("Admin password truncated to 72 bytes (bcrypt limit)")

    user = User(
        email=ADMIN_EMAIL,
        hashed_password=get_password_hash(password),
        full_name=ADMIN_FULL_NAME,
        is_superuser=True,
        tenant_id=tenant.id,
        supabase_uid=supabase_uid,
    )
    db.add(user)
    db.flush()

    user_org = UserOrganization(
        user_id=user.id,
        organization_id=org.id,
        role="owner",
    )
    db.add(user_org)
    db.commit()
    db.refresh(user)

    logger.info("Local admin user created: email=%s, tenant=%s, org=%s, role=owner", ADMIN_EMAIL, tenant.id, org.id)


def cleanup_expired_trash(db: Session) -> None:
    from sqlalchemy import inspect
    from app.models import Invoice
    from app.database import engine

    if engine is None:
        logger.warning("cleanup_expired_trash — database not available, skipping")
        return

    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns("invoices")]
    if "deleted_at" not in columns:
        logger.warning("cleanup_expired_trash — deleted_at column missing from invoices table, skipping (run migrations first)")
        return

    cutoff = datetime.utcnow() - timedelta(days=30)
    expired = (
        db.query(Invoice)
        .filter(
            Invoice.deleted_at.isnot(None),
            Invoice.deleted_at < cutoff,
        )
        .all()
    )

    if not expired:
        logger.info("cleanup_expired_trash — no invoices past the 30-day retention period")
        return

    logger.info("cleanup_expired_trash — found %d expired invoice(s) to permanently delete", len(expired))
    deleted_count = 0
    storage_errors = 0
    for invoice in expired:
        try:
            if invoice.file_path:
                if INVOICES_PREFIX in invoice.file_path:
                    ok = delete_invoice_folder(invoice.tenant_id, invoice.organization_id, invoice.id)
                    if not ok:
                        logger.warning("cleanup_expired_trash — storage cleanup failed for invoice %s, deleting DB record anyway", invoice.id)
                        storage_errors += 1
                else:
                    ok = supabase_delete(invoice.file_path)
                    if not ok:
                        logger.warning("cleanup_expired_trash — file delete failed for invoice %s: %s", invoice.id, invoice.file_path)
                        storage_errors += 1
                    if invoice.processed_path:
                        supabase_delete(invoice.processed_path)
        except Exception as exc:
            logger.warning("cleanup_expired_trash — error cleaning storage for invoice %s: %s", invoice.id, exc)
            storage_errors += 1
        db.delete(invoice)
        deleted_count += 1
    db.commit()
    logger.info("cleanup_expired_trash — %d invoice(s) deleted from database (%d storage cleanup error(s))", deleted_count, storage_errors)


async def run_startup(db: Session) -> None:
    logger.info("")
    logger.info("=" * 60)
    logger.info("  FINTRAL — Invoice Processing System")
    logger.info("  Starting up ...")
    logger.info("=" * 60)

    logger.info("")
    logger.info("--- Phase 1/4: Database ---")
    try:
        init_database()
    except Exception as exc:
        logger.error("Database initialization failed: %s", exc)
        raise

    logger.info("")
    logger.info("--- Phase 2/4: Trash Cleanup ---")
    try:
        cleanup_expired_trash(db)
    except Exception as exc:
        logger.error("Trash cleanup failed: %s", exc)
        db.rollback()

    logger.info("")
    logger.info("--- Phase 3/4: Admin User ---")
    try:
        ensure_default_admin(db)
    except Exception as exc:
        logger.error("Admin user creation failed: %s", exc)

    logger.info("")
    logger.info("--- Phase 4/4: Services ---")
    disable_heartbeat = DISABLE_HEARTBEAT_TASK
    if not disable_heartbeat:
        asyncio.create_task(start_heartbeat_task())
        logger.info("Heartbeat task started for WebSocket connections")
    else:
        logger.info("Heartbeat task disabled by environment configuration")

    logger.info("")
    logger.info("=" * 60)
    logger.info("  Fintral startup complete — ready to accept connections")
    logger.info("=" * 60)
    logger.info("")
