import asyncio

from sqlalchemy.orm import Session

from app.config import ADMIN_EMAIL, ADMIN_FULL_NAME, ADMIN_PASSWORD, DISABLE_HEARTBEAT_TASK, IS_PRODUCTION
from app.core.auth import get_password_hash
from app.core.logging import setup_logging
from app.dependencies.tenancy import get_default_org, get_default_tenant
from app.models import User, UserOrganization
from app.services.auth_service import create_admin_user
from app.services.websocket import start_heartbeat_task

logger = setup_logging()


def init_database() -> None:
    from app.database import Base, engine

    if engine is None:
        logger.warning("Base de datos no disponible, saltando inicialización")
        return
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Base de datos inicializada")
    except Exception as e:
        logger.warning("Error inicializando base de datos: %s", e)


def ensure_default_admin(db: Session) -> None:
    from app.database import engine

    if engine is None:
        logger.warning("DB no disponible, saltando creación de admin por defecto")
        return

    if not ADMIN_EMAIL:
        raise RuntimeError("ADMIN_EMAIL no configurado. Debes definirlo en el entorno.")

    existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if existing:
        logger.info("Admin user ya existe en DB local: %s", ADMIN_EMAIL)
        return

    if not ADMIN_PASSWORD:
        raise RuntimeError("ADMIN_PASSWORD no configurada. Debes definirla en el entorno.")

    # 1) PROD: create in Supabase Auth. DEVELOPMENT: legacy local password.
    supabase_uid = None
    if IS_PRODUCTION:
        supabase_result = create_admin_user(ADMIN_EMAIL, ADMIN_PASSWORD)
        if supabase_result:
            supabase_uid = supabase_result["id"]
            logger.info("Admin creado en Supabase Auth: %s", ADMIN_EMAIL)
        else:
            logger.warning("No se pudo crear admin en Supabase Auth — revisa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY")

    # 2) Create local User record (always required — stores tenant/org/role)
    tenant = get_default_tenant(db)
    org = get_default_org(db, tenant.id)

    password = ADMIN_PASSWORD
    if len(password.encode("utf-8")) > 72:
        password = password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
        logger.warning("Contraseña admin truncada a 72 bytes (límite bcrypt)")

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

    logger.info("Admin user + tenant + org creados correctamente")


async def run_startup(db: Session) -> None:
    logger.info("Iniciando aplicación...")
    init_database()

    try:
        ensure_default_admin(db)
    except Exception as exc:
        logger.error("Error creando admin user: %s", exc)

    disable_heartbeat = DISABLE_HEARTBEAT_TASK
    if not disable_heartbeat:
        asyncio.create_task(start_heartbeat_task())
    else:
        logger.info("Heartbeat task deshabilitado por entorno")

    logger.info("Aplicación iniciada correctamente")
    logger.info("WebSocket habilitado para notificaciones en tiempo real")
