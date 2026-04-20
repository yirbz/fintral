"""
Database engine, session factory, and declarative base.

This is the single source of truth for database connectivity.
"""

import logging

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL, IS_HEROKU

logger = logging.getLogger(__name__)

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
