"""
Centralized application configuration.

All environment variables are read here and exposed as module-level constants.
Other modules should import from this file instead of calling os.getenv() directly.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY: str = os.getenv("SECRET_KEY", "")
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./invoices.db")
PORT: int = int(os.getenv("PORT", "8000"))

# Detect Heroku environment
IS_HEROKU: bool = (
    os.getenv("DYNO") is not None
    or (DATABASE_URL.startswith("postgres") if DATABASE_URL else False)
)

# Heroku uses postgres:// but SQLAlchemy 1.4+ requires postgresql://
if IS_HEROKU and DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# ---------------------------------------------------------------------------
# Admin (auto-created on startup)
# ---------------------------------------------------------------------------
ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "")
ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")

# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------
REDIS_URL: str | None = os.getenv("REDIS_URL")

# ---------------------------------------------------------------------------
# OpenAI / LLM
# ---------------------------------------------------------------------------
OPENAI_API_KEY: str | None = os.getenv("OPENAI_API_KEY")
OPENAI_DAILY_LIMIT_USD: float = float(os.getenv("OPENAI_DAILY_LIMIT_USD", "10.0"))
OPENAI_HOURLY_LIMIT_REQUESTS: int = int(os.getenv("OPENAI_HOURLY_LIMIT_REQUESTS", "100"))
OLLAMA_HOST: str = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "gemma4:e2b-it-q4_K_M")

# ---------------------------------------------------------------------------
# WhatsApp / Evolution API
# ---------------------------------------------------------------------------
EVOLUTION_API_URL: str = os.getenv("EVOLUTION_API_URL", "")
EVOLUTION_API_KEY: str = os.getenv("EVOLUTION_API_KEY", "")
EVOLUTION_INSTANCE_NAME: str = os.getenv("EVOLUTION_INSTANCE_NAME", "")
EVOLUTION_INSTANCE_TOKEN: str = os.getenv("EVOLUTION_INSTANCE_TOKEN", "")
AUTHORIZED_WHATSAPP_NUMBER: str = os.getenv("AUTHORIZED_WHATSAPP_NUMBER", "15555550100")

# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 300  # 5 hours
