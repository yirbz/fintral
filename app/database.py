"""
Cross-database UUID type that works on both PostgreSQL (native UUID) and SQLite (CHAR(32)).

Usage in models:
    from app.database import Base, GUID
    id = Column(GUID, primary_key=True, default=uuid7)
"""

import uuid
import logging

from sqlalchemy import String, TypeDecorator, create_engine
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL, IS_HEROKU

logger = logging.getLogger(__name__)


class GUID(TypeDecorator):
    """Platform-independent UUID type.

    Uses PostgreSQL's native UUID type when available, otherwise stores as CHAR(32).
    """

    impl = String(32)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(String(32))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        # Handle both stdlib uuid.UUID and uuid_utils.UUID (duck typing)
        if dialect.name == "postgresql":
            if isinstance(value, uuid.UUID):
                return value
            if hasattr(value, "hex"):
                return uuid.UUID(value.hex)
            return uuid.UUID(str(value))
        # SQLite: store as hex string without dashes
        if hasattr(value, "hex"):
            return value.hex if isinstance(value.hex, str) else value.hex
        return uuid.UUID(str(value)).hex

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(str(value))


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
try:
    if DATABASE_URL.startswith("sqlite"):
        logger.info("📄 Configurando SQLite")
        engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
    else:
        logger.info("🐘 Configurando PostgreSQL para producción")
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=300,
            echo=False,
        )

    with engine.connect() as conn:
        logger.info("✅ Conexión a base de datos establecida correctamente")

except Exception as e:
    logger.error("❌ Error configurando base de datos: %s", e)
    raise

# ---------------------------------------------------------------------------
# Session & Base
# ---------------------------------------------------------------------------
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
