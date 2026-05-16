"""
PostgreSQL database engine and session factory.

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

from app.config import DATABASE_URL

logger = logging.getLogger(__name__)


class GUID(TypeDecorator):
    """UUID type backed by PostgreSQL native UUID."""

    impl = String(32)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(String(32))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, uuid.UUID):
            value = uuid.UUID(str(value))
        if dialect.name == "postgresql":
            return value
        return value.hex

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(str(value))


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
engine = None

try:
    logger.info("🐘 Conectando a PostgreSQL")
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        echo=False,
    )

    with engine.connect() as conn:
        logger.info("✅ Conexión a base de datos establecida correctamente")

except Exception as e:
    logger.warning("⚠️ Base de datos no disponible: %s", e)


def get_engine():
    global engine
    if engine is None:
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=300,
            echo=False,
        )
    return engine

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
