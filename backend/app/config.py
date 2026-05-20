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
# Environment
# ---------------------------------------------------------------------------
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "DEVELOPMENT").upper()
IS_PRODUCTION: bool = ENVIRONMENT == "PROD"
IS_DEVELOPMENT: bool = ENVIRONMENT == "DEVELOPMENT"

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY: str = os.getenv("SECRET_KEY", "")
PORT: int = int(os.getenv("PORT", "8000"))

# Database — PostgreSQL only. MUST be set in PROD.
DATABASE_URL: str = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    if IS_PRODUCTION:
        raise RuntimeError(
            "DATABASE_URL must be set in PROD environment. "
            "Set it in .env or as an environment variable."
        )
    DATABASE_URL = "postgresql://postgres:postgres@localhost:5440/invoices"

# Detect Heroku environment (separate from ENVIRONMENT — auto-detected)
IS_HEROKU: bool = os.getenv("DYNO") is not None

# Heroku uses postgres:// but SQLAlchemy 1.4+ requires postgresql://
if IS_HEROKU and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Detect PostgreSQL (Supabase, Heroku, or standalone PG)
IS_POSTGRES: bool = DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")

# ---------------------------------------------------------------------------
# Supabase (Auth + Database — required in PROD, ignored in DEVELOPMENT)
# ---------------------------------------------------------------------------
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_STORAGE_BUCKET: str = os.getenv("SUPABASE_STORAGE_BUCKET", "invoices")

# ---------------------------------------------------------------------------
# Admin (auto-created on startup via Supabase Auth)
# ---------------------------------------------------------------------------
ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "")
ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")
ADMIN_FULL_NAME: str = os.getenv("ADMIN_FULL_NAME", "Admin")

# ---------------------------------------------------------------------------
# Default organization (created on bootstrap)
# ---------------------------------------------------------------------------
ORG_NAME: str = os.getenv("ORG_NAME", "Mi Empresa S.A.")
ORG_TAX_ID: str = os.getenv("ORG_TAX_ID", "")
ORG_COUNTRY: str = os.getenv("ORG_COUNTRY", "DO")
TENANT_PLAN: str = os.getenv("TENANT_PLAN", "free")

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

# Gemini (alternative LLM via Google AI)
GEMINI_API_URL: str = os.getenv(
    "GEMINI_API_URL",
    "https://generativelanguage.googleapis.com/v1beta/models",
)
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# ---------------------------------------------------------------------------
# WhatsApp / Evolution API
# ---------------------------------------------------------------------------
EVOLUTION_API_URL: str = os.getenv("EVOLUTION_API_URL", "")
EVOLUTION_API_KEY: str = os.getenv("EVOLUTION_API_KEY", "")
EVOLUTION_INSTANCE_NAME: str = os.getenv("EVOLUTION_INSTANCE_NAME", "")
EVOLUTION_INSTANCE_TOKEN: str = os.getenv("EVOLUTION_INSTANCE_TOKEN", "")
AUTHORIZED_WHATSAPP_NUMBER: str = os.getenv("AUTHORIZED_WHATSAPP_NUMBER", "15555550100")

# ---------------------------------------------------------------------------
# Email (Resend)
# ---------------------------------------------------------------------------
RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
EMAIL_FROM: str = os.getenv("EMAIL_FROM", "Fintral <onboarding@resend.dev>")
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

# ---------------------------------------------------------------------------
# JWT (Supabase RS256 — configurable expiry for custom tokens)
# ---------------------------------------------------------------------------
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "300"))
REMEMBER_ME_EXPIRE_DAYS: int = int(os.getenv("REMEMBER_ME_EXPIRE_DAYS", "30"))

# ---------------------------------------------------------------------------
# Timezone
# ---------------------------------------------------------------------------
DEFAULT_TIMEZONE: str = os.getenv("DEFAULT_TIMEZONE", "UTC")

# ---------------------------------------------------------------------------
# Heartbeat
# ---------------------------------------------------------------------------
DISABLE_HEARTBEAT_TASK: bool = os.getenv("DISABLE_HEARTBEAT_TASK", "false").lower() == "true"
