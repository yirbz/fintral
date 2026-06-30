"""
Idempotent Lago infrastructure setup — runs on every startup.

Flow:
  1. Validate env vars (fail fast if LAGO_API_KEY is set but invalid/unreachable)
  2. Verify Lago API connectivity with configured key (retries briefly)
  3. If unreachable/401:
     a. If LAGO_DATABASE_URL is set → bootstrap directly via Postgres
     b. Else if Docker socket available → bootstrap via docker exec
     c. Else → raise RuntimeError (fail startup — broken billing config is unacceptable)
  4. Seed plans/add-ons idempotently via REST API
"""

import asyncio
import logging
import subprocess
import uuid as _uuid

import httpx
import psycopg2

from app.config import IS_PRODUCTION, LAGO_API_KEY, LAGO_API_URL

logger = logging.getLogger(__name__)

LAGO_DATABASE_URL: str | None = None  # set via config at call time

# Pre-computed bcrypt hash of "admin123" (cost=12)
_ADMIN_PASSWORD_HASH = "$2b$12$LJ3m4ys3Lg3YOCwFgEH7OOmSjRgNFOBMGq8yWY7C5NRGXBJgM3Hiy"


def _resolve_database_url() -> str | None:
    """Resolve Lago's database URL.

    Priority:
      1. LAGO_DATABASE_URL env var (explicit config)
      2. Docker Compose default (dev only)
    """
    from app.config import LAGO_DATABASE_URL as _cfg

    if _cfg:
        return _cfg
    if IS_PRODUCTION:
        return None
    return "postgresql://postgres:lago@lago-db:5432/lago"


def _validate_env() -> None:
    """Fail fast if Lago env vars are missing or using dev defaults in production."""
    if not LAGO_API_KEY:
        msg = "LAGO_API_KEY is not set — Lago billing will not work"
        if IS_PRODUCTION:
            raise RuntimeError(msg)
        logger.warning(msg)
        return

    if LAGO_API_KEY in ("fintral-lago-key-dev", "your_lago_api_key_here") and IS_PRODUCTION:
        raise RuntimeError(
            "LAGO_API_KEY is still set to a development/default value — "
            "generate a strong random key for production"
        )

    logger.info("✓ LAGO_API_KEY is set")
    logger.info("✓ LAGO_API_URL = %s", LAGO_API_URL)


async def verify_lago_connectivity() -> bool:
    """Ping Lago API to verify the API key is valid.

    Retries on connection errors AND non-200 responses (Lago Rails may still
    be booting and returning 404/503 before routes are fully loaded).

    Returns True if the key works, False if 401 (key rejected by running app)
    or if unreachable after all retries.
    """
    if not LAGO_API_KEY:
        return False

    base_url = LAGO_API_URL.rstrip("/") + "/api/v1"
    headers = {"Authorization": f"Bearer {LAGO_API_KEY}"}

    async with httpx.AsyncClient(timeout=5) as client:
        for attempt in range(30):
            try:
                resp = await client.get(f"{base_url}/organizations", headers=headers)
                if resp.status_code == 200:
                    return True
                if resp.status_code == 401:
                    logger.warning(
                        "  Lago returned 401 — API key rejected "
                        "(key=%s...)", LAGO_API_KEY[:8]
                    )
                    return False
                # 404/503 etc. during startup — retry
                logger.info(
                    "  Lago returned %d (attempt %d/30) — retrying in 5s...",
                    resp.status_code, attempt + 1,
                )
            except httpx.ConnectError:
                logger.info(
                    "  Lago not reachable yet (attempt %d/30) — retrying in 5s...",
                    attempt + 1,
                )
            except httpx.TimeoutException:
                logger.info(
                    "  Lago timed out (attempt %d/30) — retrying in 5s...",
                    attempt + 1,
                )

            if attempt < 29:
                await asyncio.sleep(5)
                continue

            logger.warning(
                "Cannot connect to Lago at %s after 30 attempts", base_url
            )
            return False


def _bootstrap_lago_via_db(database_url: str) -> bool:
    """Connect directly to Lago's PostgreSQL and create/ensure the API key.

    Handles both the legacy ``organizations.api_key`` column and the newer
    ``api_keys`` table.  Idempotent — safe to call on every startup.
    """
    logger.info("Bootstrapping Lago via direct database connection ...")

    org_id = str(_uuid.uuid4())
    user_id = str(_uuid.uuid4())

    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        cur = conn.cursor()

        # -- Debug: list existing orgs --
        cur.execute("SELECT id, name FROM organizations")
        existing = cur.fetchall()
        logger.info("  • Existing orgs in Lago DB: %s", existing or "(none)")

        # -- Organization --
        cur.execute(
            "SELECT id FROM organizations WHERE name = 'Fintral'"
        )
        row = cur.fetchone()
        if row:
            org_id = row[0]
            logger.info("  • Organization 'Fintral' already exists (id=%s)", org_id)
        else:
            hmac_key = _uuid.uuid4().hex
            # Check if 'slug' column exists in 'organizations' table (required in newer Lago versions)
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='organizations' AND column_name='slug'"
            )
            has_slug = bool(cur.fetchone())

            if has_slug:
                cur.execute(
                    "INSERT INTO organizations "
                    "(id, name, slug, hmac_key, created_at, updated_at, default_currency) "
                    "VALUES (%s, 'Fintral', 'fintral', %s, NOW(), NOW(), 'DOP')",
                    (org_id, hmac_key),
                )
            else:
                cur.execute(
                    "INSERT INTO organizations "
                    "(id, name, hmac_key, created_at, updated_at, default_currency) "
                    "VALUES (%s, 'Fintral', %s, NOW(), NOW(), 'DOP')",
                    (org_id, hmac_key),
                )
            logger.info("  • Created organization 'Fintral' (id=%s)", org_id)

        # -- Legacy: update organizations.api_key --
        cur.execute(
            "UPDATE organizations SET api_key = %s WHERE id = %s",
            (LAGO_API_KEY, org_id),
        )
        logger.info("  • Updated organizations.api_key")

        # -- User (admin) --
        admin_email = "admin@fintral.com"
        cur.execute("SELECT id FROM users WHERE email = %s", (admin_email,))
        row = cur.fetchone()
        if row:
            user_id = row[0]
            logger.info("  • Admin user already exists (id=%s)", user_id)
        else:
            cur.execute(
                "INSERT INTO users (id, email, password_digest, created_at, updated_at) "
                "VALUES (%s, %s, %s, NOW(), NOW())",
                (user_id, admin_email, _ADMIN_PASSWORD_HASH),
            )
            logger.info("  • Created admin user (id=%s)", user_id)

        # -- Membership --
        cur.execute(
            "SELECT id FROM memberships WHERE user_id = %s AND organization_id = %s",
            (user_id, org_id),
        )
        if not cur.fetchone():
            cur.execute(
                "INSERT INTO memberships (id, user_id, organization_id, created_at, updated_at) "
                "VALUES (%s, %s, %s, NOW(), NOW())",
                (str(_uuid.uuid4()), user_id, org_id),
            )
            logger.info("  • Created membership")

        # -- Newer api_keys table (if it exists) --
        try:
            # Check if 'permissions' column exists in 'api_keys' (required in newer Lago versions)
            cur.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name='api_keys' AND column_name='permissions'"
            )
            has_permissions = bool(cur.fetchone())

            cur.execute(
                "SELECT id FROM api_keys WHERE organization_id = %s AND value = %s",
                (org_id, LAGO_API_KEY),
            )
            if cur.fetchone():
                logger.info("  • API key already exists in api_keys table")
            else:
                if has_permissions:
                    import json
                    default_perms = {
                        "activity_log": ["read", "write"],
                        "add_on": ["read", "write"],
                        "analytic": ["read", "write"],
                        "api_log": ["read", "write"],
                        "billable_metric": ["read", "write"],
                        "coupon": ["read", "write"],
                        "applied_coupon": ["read", "write"],
                        "credit_note": ["read", "write"],
                        "customer_usage": ["read", "write"],
                        "customer": ["read", "write"],
                        "event": ["read", "write"],
                        "fee": ["read", "write"],
                        "invoice": ["read", "write"],
                        "organization": ["read", "write"],
                        "order_form": ["read", "write"],
                        "payment": ["read", "write"],
                        "payment_receipt": ["read", "write"],
                        "payment_request": ["read", "write"],
                        "payment_method": ["read", "write"],
                        "plan": ["read", "write"],
                        "subscription": ["read", "write"],
                        "lifetime_usage": ["read", "write"],
                        "tax": ["read", "write"],
                        "wallet": ["read", "write"],
                        "wallet_transaction": ["read", "write"],
                        "webhook_endpoint": ["read", "write"],
                        "webhook_jwt_public_key": ["read", "write"],
                        "invoice_custom_section": ["read", "write"],
                        "billing_entity": ["read", "write"],
                        "alert": ["read", "write"],
                        "feature": ["read", "write"],
                        "security_log": ["read", "write"],
                        "quote": ["read", "write"]
                    }
                    cur.execute(
                        "INSERT INTO api_keys (id, organization_id, value, name, permissions, created_at, updated_at) "
                        "VALUES (%s, %s, %s, 'Fintral Dev Key', %s, NOW(), NOW()) "
                        "ON CONFLICT DO NOTHING",
                        (str(_uuid.uuid4()), org_id, LAGO_API_KEY, json.dumps(default_perms)),
                    )
                else:
                    cur.execute(
                        "INSERT INTO api_keys (id, organization_id, value, name, created_at, updated_at) "
                        "VALUES (%s, %s, %s, 'Fintral Dev Key', NOW(), NOW()) "
                        "ON CONFLICT DO NOTHING",
                        (str(_uuid.uuid4()), org_id, LAGO_API_KEY),
                    )
                logger.info("  • Created API key in api_keys table")
            # Ensure exactly one api_key with our expected value
            # Delete duplicates first (Lago seed + previous bootstrap creates extras)
            cur.execute("DELETE FROM api_keys WHERE organization_id = %s AND value != %s", (org_id, LAGO_API_KEY))
            cur.execute(
                "UPDATE api_keys SET value = %s WHERE organization_id = %s",
                (LAGO_API_KEY, org_id),
            )
            logger.info("  • Ensured exactly one API key for org")
        except psycopg2.errors.UndefinedTable:
            logger.info("  • api_keys table does not exist (older Lago version) — using legacy api_key column")

        # -- Billing Entity --
        try:
            cur.execute(
                "SELECT id FROM billing_entities WHERE organization_id = %s",
                (org_id,),
            )
            if cur.fetchone():
                logger.info("  • Billing entity already exists")
            else:
                cur.execute(
                    "INSERT INTO billing_entities "
                    "(id, organization_id, name, code, default_currency, country, created_at, updated_at) "
                    "VALUES (%s, %s, 'Fintral Entity', 'fintral_default', 'DOP', 'DO', NOW(), NOW())",
                    (str(_uuid.uuid4()), org_id),
                )
                logger.info("  • Created billing entity")
        except psycopg2.DatabaseError as e:
            logger.info("  • billing_entities insert skipped (non-critical): %s", e)

        conn.close()
        logger.info("✓ Lago database bootstrap completed")
        return True

    except psycopg2.OperationalError as e:
        logger.warning("[db bootstrap] Cannot connect to Lago database at %s: %s", database_url.split("@")[-1], e)
        return False
    except psycopg2.errors.UndefinedTable as e:
        logger.warning("[db bootstrap] Missing table — schema may have changed: %s", e)
        return False
    except psycopg2.DatabaseError as e:
        logger.warning("[db bootstrap] SQL error — check Lago schema compatibility: %s", e)
        return False
    except Exception as e:
        logger.warning("[db bootstrap] Unexpected error: %s (%s)", e, type(e).__name__)
        return False


def _bootstrap_lago_via_docker() -> bool:
    """Run Rails runner inside the Lago Docker container via the Docker socket.

    Tries ``docker exec`` with the well-known container name, then falls back
    to ``docker compose exec``.  Requires the Docker socket to be mounted
    (``/var/run/docker.sock``) into the backend container.
    """
    if not LAGO_API_KEY:
        return False

    api_key_value = LAGO_API_KEY.replace("'", "\\'")
    ruby_cmd = (
        "org = Organization.find_or_create_by!(name: 'Fintral'); "
        "user = User.find_or_initialize_by(email: 'admin@fintral.com'); "
        "if user.new_record?; user.password = 'admin123'; user.save!; end; "
        "Membership.find_or_create_by!(user: user, organization: org); "
        f"api_key = ApiKey.find_or_initialize_by(organization: org, value: '{api_key_value}'); "
        "if api_key.new_record?; "
        "  api_key.name = 'Fintral Dev Key'; "
        "  api_key.permissions = ApiKey.new.permissions; "
        "  api_key.save!; "
        "end; "
        f"ActiveRecord::Base.connection.execute("
        f"\"UPDATE api_keys SET value='{api_key_value}' WHERE name='Fintral Dev Key'\"" 
        f"); "
        "if BillingEntity.count == 0; "
        "  BillingEntity.create!("
        "    organization: org, name: 'Fintral Entity', "
        "    code: 'fintral_default', default_currency: 'DOP', country: 'DO'"
        "  ); "
        "end; "
        "puts 'Bootstrap success!'"
    )

    candidates = [
        ["docker", "exec", "-i", "fintral-lago-api-dev"],
        ["docker", "exec", "-i", "fintral-lago-api"],
        ["docker", "compose", "exec", "-T", "lago-api"],
    ]

    for cmd_prefix in candidates:
        try:
            subprocess.run(["docker", "info"], capture_output=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            logger.info("  • Docker CLI not available")
            return False

        full_cmd = cmd_prefix + ["bundle", "exec", "rails", "runner", ruby_cmd]
        try:
            res = subprocess.run(full_cmd, capture_output=True, text=True, check=True, timeout=60)
            logger.info("✓ Lago Docker bootstrap: %s", res.stdout.strip())
            return True
        except subprocess.CalledProcessError as e:
            logger.info("  • Tried %s... failed: %s", cmd_prefix[0], e.stderr[:500] if e.stderr else str(e))
            continue
        except Exception as e:
            logger.info("  • Tried %s... error: %s", cmd_prefix[0], e)
            continue

    logger.warning("All Docker exec attempts failed")
    return False


async def seed_lago_plans() -> None:
    """Idempotently seed Lago plans and add-ons via REST API.

    Skips items that already exist.  Safe to call on every startup.
    """
    base_url = LAGO_API_URL.rstrip("/") + "/api/v1"
    headers = {"Authorization": f"Bearer {LAGO_API_KEY}", "Content-Type": "application/json"}

    plans = [
        {"code": "inicial", "name": "Plan Inicial", "interval": "monthly",
         "amount_cents": 99900, "amount_currency": "DOP", "pay_in_advance": True},
        {"code": "profesional", "name": "Plan Profesional", "interval": "monthly",
         "amount_cents": 299900, "amount_currency": "DOP", "pay_in_advance": True},
        {"code": "despacho", "name": "Plan Despacho", "interval": "monthly",
         "amount_cents": 799900, "amount_currency": "DOP", "pay_in_advance": True},
        {"code": "inicial_12m", "name": "Plan Inicial (12 meses)", "interval": "yearly",
         "amount_cents": 1078920, "amount_currency": "DOP", "pay_in_advance": True},
        {"code": "profesional_12m", "name": "Plan Profesional (12 meses)", "interval": "yearly",
         "amount_cents": 3238920, "amount_currency": "DOP", "pay_in_advance": True},
        {"code": "despacho_12m", "name": "Plan Despacho (12 meses)", "interval": "yearly",
         "amount_cents": 8638920, "amount_currency": "DOP", "pay_in_advance": True},
    ]
    addons = [
        {"code": "ecf_block_100", "name": "Bloque 100 ECF",
         "amount_cents": 95000, "amount_currency": "DOP"},
        {"code": "ecf_block_500", "name": "Bloque 500 ECF",
         "amount_cents": 200000, "amount_currency": "DOP"},
        {"code": "ecf_block_1000", "name": "Bloque 1000 ECF",
         "amount_cents": 350000, "amount_currency": "DOP"},
        {"code": "entity_slot", "name": "Slot de Empresa Adicional",
         "amount_cents": 60000, "amount_currency": "DOP"},
        {"code": "user_slot", "name": "Slot de Usuario Adicional",
         "amount_cents": 30000, "amount_currency": "DOP"},
    ]

    async with httpx.AsyncClient(timeout=15, headers=headers) as client:
        # Existing plans
        try:
            resp = await client.get(f"{base_url}/plans?per_page=100")
            resp.raise_for_status()
            existing_plan_codes = {p["code"] for p in resp.json().get("plans", [])}
        except Exception as e:
            logger.warning("Failed to fetch plans from Lago: %s", e)
            return

        for p in plans:
            if p["code"] in existing_plan_codes:
                logger.info("  • Plan '%s' already exists in Lago.", p["name"])
            else:
                try:
                    resp = await client.post(f"{base_url}/plans", json={"plan": p})
                    resp.raise_for_status()
                    logger.info("  • Created plan: %s", p["name"])
                except Exception as e:
                    logger.warning("Failed to create plan '%s': %s", p["name"], e)

        # Existing add-ons
        try:
            resp = await client.get(f"{base_url}/add_ons?per_page=100")
            resp.raise_for_status()
            existing_addon_codes = {a["code"] for a in resp.json().get("add_ons", [])}
        except Exception as e:
            logger.warning("Failed to fetch add-ons from Lago: %s", e)
            return

        for a in addons:
            if a["code"] in existing_addon_codes:
                logger.info("  • Add-on '%s' already exists in Lago.", a["name"])
            else:
                try:
                    resp = await client.post(f"{base_url}/add_ons", json={"add_on": a})
                    resp.raise_for_status()
                    logger.info("  • Created add-on: %s", a["name"])
                except Exception as e:
                    logger.warning("Failed to create add-on '%s': %s", a["name"], e)


async def seed_lago_invoice_custom_section() -> None:
    """Create invoice custom section with bank transfer details."""
    from app import config as settings

    if not LAGO_API_KEY:
        return

    base_url = LAGO_API_URL.rstrip("/") + "/api/v1"
    headers = {"Authorization": f"Bearer {LAGO_API_KEY}", "Content-Type": "application/json"}

    section_data = {
        "invoice_custom_section": {
            "name": "Datos de Transferencia Bancaria",
            "code": "bank_transfer_details",
            "display_name": "Transferencia Bancaria",
            "details": (
                f"<b>Banco:</b> {settings.BANK_NAME}<br/>"
                f"<b>Titular:</b> {settings.BANK_ACCOUNT_HOLDER}<br/>"
                f"<b>Cuenta:</b> {settings.BANK_ACCOUNT_NUMBER}<br/>"
                f"<b>Moneda:</b> DOP<br/>"
                f"<b>Método:</b> Transferencia bancaria / Depósito<br/>"
                f"Luego de realizar el pago, envía el comprobante a soporte."
            ),
        }
    }

    async with httpx.AsyncClient(timeout=15, headers=headers) as client:
        try:
            resp = await client.get(f"{base_url}/invoice_custom_sections")
            resp.raise_for_status()
            existing = resp.json().get("invoice_custom_sections", [])
            if any(s.get("code") == "bank_transfer_details" for s in existing):
                logger.info("  • Invoice custom section already exists")
                return
        except Exception as e:
            logger.warning("  • Failed to fetch invoice custom sections: %s", e)
            return

        try:
            resp = await client.post(
                f"{base_url}/invoice_custom_sections",
                json=section_data,
            )
            resp.raise_for_status()
            logger.info("  • Created invoice custom section with bank transfer details")
        except Exception as e:
            logger.warning("  • Failed to create invoice custom section: %s", e)


async def setup_lago_infrastructure() -> None:
    """Full Lago bootstrap — call once during application startup.

    Fails fast (raises) on any Lago misconfiguration so that broken billing
    state is caught before the app starts serving traffic.

    Validation & bootstrap flow:
      1. Validate env vars (warn if missing, raise if invalid defaults in prod)
      2. Check Lago API connectivity with configured key (retries briefly)
      3. If unreachable or 401:
         a. Direct DB bootstrap (if LAGO_DATABASE_URL is set or can be inferred)
         b. Docker exec fallback (if Docker socket is mounted)
         c. Raise RuntimeError (billing features require a working Lago connection)
      4. Re-verify connectivity after bootstrap
      5. Seed plans/add-ons idempotently via REST API
    """
    _validate_env()
    if not LAGO_API_KEY:
        return

    logger.info("Lago config: URL=%s key=%s...", LAGO_API_URL, LAGO_API_KEY[:8] if LAGO_API_KEY else "none")

    connected = await verify_lago_connectivity()
    if connected:
        logger.info("✓ Lago API connection verified — key is valid")
    else:
        logger.warning("Lago API unreachable or key rejected — attempting bootstrap...")

        database_url = _resolve_database_url()

        bootstrapped = False
        if database_url:
            logger.info("  Method 1/2: Direct database connection...")
            bootstrapped = _bootstrap_lago_via_db(database_url)

        if not bootstrapped:
            logger.info("  Method 2/2: Docker exec...")
            bootstrapped = _bootstrap_lago_via_docker()

        if not bootstrapped:
            msg = (
                f"Lago bootstrap failed (URL={LAGO_API_URL}, "
                f"key={LAGO_API_KEY[:8]}...). "
                "Billing features require a working Lago connection."
            )
            if not IS_PRODUCTION:
                msg += (
                    "\n  • Make sure Lago containers are running (`docker compose ps`)\n"
                    "  • Check that LAGO_API_KEY in Doppler matches Lago's expected key\n"
                    "  • Set LAGO_DATABASE_URL to Lago's PostgreSQL for automatic bootstrap"
                )
            raise RuntimeError(msg)

        # Re-verify after bootstrap
        connected = await verify_lago_connectivity()
        if not connected:
            raise RuntimeError(
                "Lago still unreachable after bootstrap — API key mismatch or connectivity issue"
            )

        logger.info("✓ Lago connection established after bootstrap")

    await seed_lago_plans()
    await seed_lago_invoice_custom_section()
    logger.info("✓ Lago infrastructure setup complete")
