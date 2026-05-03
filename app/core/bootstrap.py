import asyncio

from sqlalchemy.orm import Session

from app.config import ADMIN_EMAIL, ADMIN_PASSWORD
from app.core.auth import get_password_hash
from app.core.logging import setup_logging
from app.database import Base, engine
from app.models import User, UserOrganization
from app.dependencies.tenancy import get_default_tenant, get_default_org
from app.services.websocket import start_heartbeat_task

logger = setup_logging()


def init_database() -> None:
    """Create all tables that don't exist yet."""
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Base de datos inicializada")


def ensure_default_admin(db: Session) -> None:
    if not ADMIN_EMAIL:
        raise RuntimeError("ADMIN_EMAIL no configurado. Debes definirlo en el entorno.")

    existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if existing:
        return

    if not ADMIN_PASSWORD:
        raise RuntimeError("ADMIN_PASSWORD no configurada. Debes definirla en el entorno.")

    logger.info("👤 Creando usuario admin por defecto: %s", ADMIN_EMAIL)
    password = ADMIN_PASSWORD
    if len(password.encode("utf-8")) > 72:
        password = password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
        logger.warning("⚠️ Contraseña admin truncada a 72 bytes (límite bcrypt)")

    # Ensure default tenant + org exist
    tenant = get_default_tenant(db)
    org = get_default_org(db, tenant.id)

    user = User(
        email=ADMIN_EMAIL,
        hashed_password=get_password_hash(password),
        full_name="Admin User",
        is_superuser=True,
        tenant_id=tenant.id,
    )
    db.add(user)
    db.flush()  # Get user.id before creating the association

    # Give admin "owner" access to the default org
    user_org = UserOrganization(
        user_id=user.id,
        organization_id=org.id,
        role="owner",
    )
    db.add(user_org)
    db.commit()

    logger.info("✅ Admin user + tenant + org creados correctamente")


async def run_startup(db: Session) -> None:
    logger.info("🚀 Iniciando aplicación...")
    init_database()

    try:
        ensure_default_admin(db)
    except Exception as exc:  # noqa: BLE001
        logger.error("Error creando admin user: %s", exc)

    asyncio.create_task(start_heartbeat_task())

    logger.info("✅ Aplicación iniciada correctamente")
    logger.info("📡 WebSocket habilitado para notificaciones en tiempo real")
