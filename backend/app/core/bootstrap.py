import asyncio

from sqlalchemy.orm import Session

from app.config import ADMIN_EMAIL, ADMIN_FULL_NAME, ADMIN_PASSWORD, IS_PRODUCTION
from app.core.auth import get_password_hash
from app.core.logging import setup_logging
from app.core.reference_data import seed_reference_data
from app.dependencies.tenancy import get_default_org, get_default_tenant
from app.models import User, UserOrganization
from app.services.auth_service import create_admin_user
from app.services.dgii_health import start_dgii_health_task
from app.services.websocket import start_heartbeat_task
from app.services.daily_metrics import start_daily_metrics_task
from app.services.seed_plans import seed_plans

logger = setup_logging()


def _detect_schema_drift(inspector, engine) -> list[str]:
    """Compare ALL ORM model columns against the database schema.

    Returns a list of "table.column" strings for any column that exists
    in the ORM model but is missing from the actual database.  An empty
    list means the schema is up-to-date.
    """
    from app.database import Base

    missing: list[str] = []

    # Collect every (table_name, column_name) declared in the ORM
    orm_columns: dict[str, set[str]] = {}
    for table in Base.metadata.sorted_tables:
        orm_columns[table.name] = {col.name for col in table.columns}

    # Compare against the real database
    for table_name, expected_cols in orm_columns.items():
        try:
            db_cols = {col["name"] for col in inspector.get_columns(table_name)}
        except Exception:
            # Table doesn't exist yet — that's fine, migrations will create it
            continue
        for col_name in sorted(expected_cols - db_cols):
            missing.append(f"{table_name}.{col_name}")

    return missing


def init_database() -> None:
    import time

    from alembic import command
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import create_engine, inspect, text

    from app.config import DATABASE_URL
    from app.database import Base, engine

    if engine is None:
        logger.warning("init_database — engine not available, skipping")
        return

    if engine.dialect.name == "sqlite":
        logger.info("init_database — SQLite detected, creating all tables directly via metadata")
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("init_database — SQLite tables created successfully")
        except Exception as e:
            logger.error("init_database — SQLite create_all failed: %s", e)
            raise
        return

    t0 = time.time()

    migrator_engine = create_engine(
        DATABASE_URL,
        pool_size=2,
        max_overflow=0,
        pool_pre_ping=True,
        pool_recycle=300,
        echo=False,
    )

    alembic_cfg = Config("alembic.ini")
    alembic_cfg.attributes["skip_logging_config"] = True
    alembic_cfg.attributes["engine"] = migrator_engine
    inspector = inspect(migrator_engine)
    tables = inspector.get_table_names()
    has_alembic_version = "alembic_version" in tables
    has_data_tables = "invoices" in tables
    logger.info(
        "init_database — has_alembic_version=%s has_data_tables=%s tables=%d (%.2fs)",
        has_alembic_version,
        has_data_tables,
        len(tables),
        time.time() - t0,
    )

    if has_alembic_version:
        with migrator_engine.connect() as conn:
            row = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        script = ScriptDirectory.from_config(alembic_cfg)
        head_rev = script.get_current_head()
        logger.info("alembic_version=%s head=%s match=%s", row, head_rev, row == head_rev)

        # Verify alembic version actually matches reality — compare ALL
        # ORM model columns against the database. If any column is missing,
        # the previous migration likely failed silently. Reset and re-run.
        if row == head_rev and head_rev != script.get_base():
            drift = _detect_schema_drift(inspector, migrator_engine)
            if drift:
                base_rev = script.get_base()
                logger.warning(
                    "alembic_version=%s but schema drift detected — "
                    "missing %d column(s): %s. Resetting to base (%s).",
                    row, len(drift), drift, base_rev,
                )
                with migrator_engine.connect() as conn:
                    conn.execute(text("UPDATE alembic_version SET version_num = :base"), {"base": base_rev})
                    conn.commit()
                row = base_rev

        if row == head_rev:
            logger.info("Already at head revision — skipping alembic upgrade")
            return

        db_rev_exists = row in [r.revision for r in script.walk_revisions()]
        if not db_rev_exists and has_data_tables:
            base_rev = script.get_base()
            logger.warning(
                "Current alembic_version=%s not found in migration scripts — "
                "likely the initial migration was regenerated. "
                "Stamping to base (%s) via SQL, then running pending migrations.",
                row,
                base_rev,
            )
            with migrator_engine.connect() as conn:
                conn.execute(text("UPDATE alembic_version SET version_num = :base"), {"base": base_rev})
                conn.commit()
            logger.info("Updated alembic_version from %s to %s", row, base_rev)
            # Fall through to run pending migrations below

        t1 = time.time()
        logger.info("Running pending migrations from %s to %s ...", row, head_rev)

        # Disable transaction wrapping so each migration step commits
        # individually — a failure in one step (e.g. table already exists)
        # won't roll back earlier steps.
        alembic_cfg.attributes["disable_transactional_ddl"] = True

        skipped_revs: list[str] = []

        # Phase 1: Bulk-upgrade to the last merge point (4ee1914d8429).
        # All migrations up to here are idempotent, so this should succeed.
        # If it fails we fall through to per-revision loop.
        MERGE_REV = "4ee1914d8429"
        merge_idx = row
        try:
            command.upgrade(alembic_cfg, MERGE_REV)
            logger.info("Bulk upgrade to merge point %s done (%.2fs)", MERGE_REV, time.time() - t1)
            merge_idx = MERGE_REV
        except Exception as e:
            logger.warning(
                "Bulk upgrade to %s failed (%s) — falling back to per-revision: %s",
                MERGE_REV, type(e).__name__, e,
            )

        # Phase 2: Per-revision upgrade for the linear tail (merge → head).
        # Each step is tried individually; "already exists" errors are skipped
        # so a single non-idempotent migration doesn't derail the whole chain.
        pending = list(script.walk_revisions(head=head_rev, base=merge_idx))
        pending.reverse()  # topological order (base → head)
        for rev in pending:
            if rev.revision in (merge_idx, "4ee1914d8429"):
                # Already applied by the bulk upgrade or doesn't exist
                continue
            try:
                command.upgrade(alembic_cfg, rev.revision)
                logger.info("  ✓ %s (%s)", rev.revision, rev.doc or "no doc")
            except Exception as e:
                err = str(e).lower()
                if "already exists" in err or "duplicate" in err or "does not exist" in err:
                    skipped_revs.append(rev.revision)
                    logger.warning(
                        "  ✗ %s (%s) — skipping (already exists): %s",
                        rev.revision, rev.doc or "no doc", e,
                    )
                    with migrator_engine.connect() as conn:
                        conn.execute(
                            text("UPDATE alembic_version SET version_num = :rev"),
                            {"rev": rev.revision},
                        )
                        conn.commit()
                else:
                    logger.error(
                        "Fatal error in migration %s (%s): %s",
                        rev.revision, rev.doc or "no doc", e,
                    )
                    raise

        if skipped_revs:
            logger.warning(
                "Skipped %d non-idempotent migration(s): %s",
                len(skipped_revs), ", ".join(skipped_revs),
            )

        # Verify schema is now correct after migrations
        post_drift = _detect_schema_drift(inspector, migrator_engine)
        if post_drift:
            logger.error(
                "Schema still has drift after migrations: %s — "
                "manual intervention required.",
                post_drift,
            )
            raise RuntimeError(f"Schema drift persists after migrations: {post_drift}")
        else:
            logger.info("Schema verified — all ORM columns present in database")

        logger.info("Alembic migrations applied (%.2fs)", time.time() - t1)
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
        logger.warning(
            "Alembic upgrade failed (%s) — falling back to create_all (%.2fs): %s",
            type(e).__name__,
            time.time() - t1,
            e,
        )
        try:
            Base.metadata.create_all(bind=migrator_engine)
            logger.info("create_all fallback done")
        except Exception as ca_err:
            logger.warning("create_all also failed: %s", ca_err)

    migrator_engine.dispose()
    logger.debug("migrator_engine disposed after startup")


def ensure_default_admin(db: Session) -> None:
    from app.database import engine

    if engine is None:
        logger.warning("ensure_default_admin — database not available, skipping admin creation")
        return

    if not ADMIN_EMAIL:
        raise RuntimeError("ADMIN_EMAIL is not set. This is required to bootstrap the system.")

    existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if existing:
        logger.info("Admin user already exists: %s. Updating password and details to match current config.", ADMIN_EMAIL)
        password = ADMIN_PASSWORD
        if len(password.encode("utf-8")) > 72:
            password = password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
            logger.warning("Admin password truncated to 72 bytes (bcrypt limit)")
        existing.hashed_password = get_password_hash(password)
        existing.full_name = ADMIN_FULL_NAME
        existing.is_superuser = True
        
        # Ensure they exist in Supabase Auth if configured
        from app.config import SUPABASE_URL
        if not existing.supabase_uid and (IS_PRODUCTION or SUPABASE_URL):
            supabase_result = create_admin_user(ADMIN_EMAIL, ADMIN_PASSWORD)
            if supabase_result:
                existing.supabase_uid = supabase_result["id"]
                logger.info("Linked Supabase UID during update: email=%s, supabase_id=%s", ADMIN_EMAIL, existing.supabase_uid)
        
        db.commit()
        return

    if not ADMIN_PASSWORD:
        raise RuntimeError("ADMIN_PASSWORD is not set. This is required to bootstrap the system.")

    supabase_uid = None
    from app.config import SUPABASE_URL
    if IS_PRODUCTION or SUPABASE_URL:
        supabase_result = create_admin_user(ADMIN_EMAIL, ADMIN_PASSWORD)
        if supabase_result:
            supabase_uid = supabase_result["id"]
            logger.info("Admin user created in Supabase Auth: %s (id=%s)", ADMIN_EMAIL, supabase_uid)
        else:
            logger.warning(
                "Supabase Auth admin creation failed for %s — check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
                ADMIN_EMAIL,
            )

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


async def run_startup(db: Session) -> None:
    logger.info("")
    logger.info("=" * 60)
    logger.info("  FINTRAL — Invoice Processing System")
    logger.info("  Starting up ...")
    logger.info("=" * 60)

    logger.info("")
    logger.info("--- Phase 1/3: Database ---")
    try:
        init_database()
    except Exception as exc:
        logger.error("Database initialization failed: %s", exc)
        raise

    logger.info("")
    logger.info("--- Phase 2/3: Reference Data ---")
    try:
        seed_reference_data(db)
    except Exception as exc:
        logger.error("Reference data seeding failed: %s", exc)

    logger.info("")
    logger.info("--- Phase 3/3: Admin User ---")
    try:
        ensure_default_admin(db)
    except Exception as exc:
        logger.error("Admin user creation failed: %s", exc)

    logger.info("")
    logger.info("--- Phase 4/4: Subscription Plans ---")
    try:
        seed_plans(db)
    except Exception as exc:
        logger.error("Plan seeding failed: %s", exc)

    logger.info("")
    logger.info("--- Phase 5/5: Services ---")
    asyncio.create_task(start_heartbeat_task())
    logger.info("Heartbeat task started for WebSocket connections")

    asyncio.create_task(start_dgii_health_task())
    logger.info("DGII health check scheduler started (daily at 06:00 UTC)")

    asyncio.create_task(start_daily_metrics_task())
    logger.info("Daily metrics scheduler started (daily at 00:05 UTC)")

    logger.info("")
    logger.info("=" * 60)
    logger.info("  Fintral startup complete — ready to accept connections")
    logger.info("=" * 60)
    logger.info("")
