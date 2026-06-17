"""
Centralized application configuration.

ALL environment variables are read and validated here.
Other modules MUST import from this file — never call os.getenv() directly.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)

# ===========================================================================
# Environment mode
# ===========================================================================
# Accepts: DEVELOPMENT | STAGING | PRODUCTION
# - DEVELOPMENT: local Supabase, bcrypt fallback, no cleanup task
# - STAGING:     production-like but points to staging cloud services
# - PRODUCTION:  full production mode with Supabase Auth + cleanup task
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "DEVELOPMENT").upper()
IS_PRODUCTION: bool = ENVIRONMENT in ("PRODUCTION", "STAGING")
IS_DEVELOPMENT: bool = ENVIRONMENT == "DEVELOPMENT"

# ===========================================================================
# Server
# ===========================================================================
# TCP port the backend HTTP server binds to (uvicorn)
BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", os.getenv("PORT", "8000")))
# Deprecated: use BACKEND_PORT instead
_ = os.getenv("PORT")  # kept for backwards compat during migration

APP_JWT_SECRET_KEY: str = os.getenv("APP_JWT_SECRET_KEY", "")

# ===========================================================================
# Database (PostgreSQL only)
# ===========================================================================
# Full connection string. In DEVELOPMENT with local Supabase:
#   postgresql://postgres:postgres@host.docker.internal:54322/postgres
# In PRODUCTION/STAGING: Supabase pooled connection string from dashboard.
DATABASE_URL: str = os.getenv("DATABASE_URL", "")
if not DATABASE_URL and IS_PRODUCTION:
    raise RuntimeError(
        "DATABASE_URL must be set in PRODUCTION/STAGING. "
        "Set it via Doppler or as an environment variable."
    )
if not DATABASE_URL:
    DATABASE_URL = "postgresql://postgres:postgres@localhost:5440/invoices"

# Auto-detect: true if DATABASE_URL starts with postgresql://
IS_POSTGRES: bool = DATABASE_URL.startswith("postgresql://")

# ===========================================================================
# Supabase (Auth + Storage + Database)
# ===========================================================================
# The API endpoint of your Supabase project.
# DEVELOPMENT: http://host.docker.internal:54321  (local Supabase CLI)
# PRODUCTION:  https://<project>.supabase.co
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")

# Expected JWT issuer claim (defaults to SUPABASE_URL/auth/v1).
# Override when the internal Docker URL differs from what gotrue uses
# as the issuer in JWTs (e.g. gotrue uses 127.0.0.1:54321 internally).
# Example: http://127.0.0.1:54321/auth/v1
SUPABASE_JWT_ISSUER: str = os.getenv("SUPABASE_JWT_ISSUER", "")

# service_role key for admin operations (user creation, storage admin).
# NEVER expose this to the client. Use SUPABASE_ANON_KEY for public ops.
SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Storage bucket name for invoice attachments, profile pictures, etc.
# Created automatically on bootstrap if it doesn't exist.
SUPABASE_STORAGE_BUCKET: str = os.getenv("SUPABASE_STORAGE_BUCKET", "invoices")

# ===========================================================================
# Admin bootstrap (auto-created on first startup)
# ===========================================================================
ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "")
ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")
ADMIN_FULL_NAME: str = os.getenv("ADMIN_FULL_NAME", "Admin")

# ===========================================================================
# Default organization (created during bootstrap)
# ===========================================================================
ORG_NAME: str = os.getenv("ORG_NAME", "Mi Empresa S.A.")
ORG_TAX_ID: str = os.getenv("ORG_TAX_ID", "")
ORG_COUNTRY: str = os.getenv("ORG_COUNTRY", "DO")
TENANT_PLAN: str = os.getenv("TENANT_PLAN", "free")

# ===========================================================================
# Redis (caching, rate limiting, message deduplication)
# ===========================================================================
# DEVELOPMENT: redis://redis:6379/0  (from docker-compose)
# PRODUCTION:  rediss://default:<token>@<upstash-url>:<port>
REDIS_URL: str | None = os.getenv("REDIS_URL")

# ===========================================================================
# LLM Providers (multi-modal invoice parsing pipeline)
# ===========================================================================
AI_PIPELINE_KEY: str | None = os.getenv("AI_PIPELINE_KEY", os.getenv("AI_MODEL_API_KEY", os.getenv("OPENAI_API_KEY")))
AI_MODEL_API_KEY: str | None = AI_PIPELINE_KEY
OPENAI_API_KEY: str | None = AI_PIPELINE_KEY

AI_PIPELINE_MODEL: str = os.getenv("AI_PIPELINE_MODEL", os.getenv("AI_MODEL_NAME", os.getenv("GEMINI_MODEL", "gemini-2.0-flash")))
AI_MODEL_NAME: str = AI_PIPELINE_MODEL

AI_SIDECAR_KEY: str | None = os.getenv("AI_SIDECAR_KEY", os.getenv("AI_ASSISTANT_KEY", os.getenv("OPENAI_API_KEY")))
AI_ASSISTANT_KEY: str | None = AI_SIDECAR_KEY

AI_SIDECAR_MODEL: str = os.getenv("AI_SIDECAR_MODEL", os.getenv("AI_ASSISTANT_MODEL", "gemini-2.5-flash"))
AI_ASSISTANT_MODEL: str = AI_SIDECAR_MODEL

# ===========================================================================
# Email (Resend)
# ===========================================================================
# Transactional emails: verification, password reset, notifications.
RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
EMAIL_FROM: str = os.getenv("EMAIL_FROM", "Fintral <onboarding@resend.dev>")
BILLING_EMAIL_FROM: str = os.getenv("BILLING_EMAIL_FROM", "Fintral Facturación <billing@noreply.fintral.app>")

# ===========================================================================
# Bank transfer details (shown in checkout modal and invoice emails)
# ===========================================================================
BANK_NAME: str = os.getenv("BANK_NAME", "Banco Popular Dominicano")
BANK_ACCOUNT_HOLDER: str = os.getenv("BANK_ACCOUNT_HOLDER", "Fintral SRL")
BANK_ACCOUNT_NUMBER: str = os.getenv("BANK_ACCOUNT_NUMBER", "123-456789-01")

# Public-facing URL of the frontend (used in OAuth redirect URIs and email links).
# NOT the internal docker-compose service URL.
PUBLIC_APP_URL: str = os.getenv("PUBLIC_APP_URL", os.getenv("FRONTEND_URL", "http://localhost:3000"))
# Deprecated alias — remove after Doppler migration
if not os.getenv("PUBLIC_APP_URL") and os.getenv("FRONTEND_URL"):
    PUBLIC_APP_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")  # type: ignore

# ===========================================================================
# Auth tokens
# ===========================================================================
# Legacy JWT "remember me" cookie expiry (HS256, local dev fallback)
REMEMBER_ME_EXPIRE_DAYS: int = int(os.getenv("REMEMBER_ME_EXPIRE_DAYS", "30"))

# ===========================================================================
# Data directory (local file storage for uploads, static assets)
# ===========================================================================
# Path where uploaded files and served static assets live.
# Defaults to ./uploads and ./static relative to the app root.
# In Docker: /app/uploads and /app/static (handled by volumes).
FINTRAL_DATA_DIR: str = os.getenv("FINTRAL_DATA_DIR", os.path.join(os.getcwd(), "data"))

# ===========================================================================
# Integrations: OAuth + Third-party APIs
# ===========================================================================

# QuickBooks Online
QUICKBOOKS_CLIENT_ID: str = os.getenv("QUICKBOOKS_CLIENT_ID", "")
QUICKBOOKS_CLIENT_SECRET: str = os.getenv("QUICKBOOKS_CLIENT_SECRET", "")
QUICKBOOKS_REDIRECT_URI: str = os.getenv(
    "QUICKBOOKS_REDIRECT_URI",
    "http://localhost:8003/api/integrations/quickbooks/callback",
)
QUICKBOOKS_SANDBOX: bool = os.getenv("QUICKBOOKS_SANDBOX", "true").lower() == "true"

# Xero
XERO_CLIENT_ID: str = os.getenv("XERO_CLIENT_ID", "")
XERO_CLIENT_SECRET: str = os.getenv("XERO_CLIENT_SECRET", "")
XERO_REDIRECT_URI: str = os.getenv(
    "XERO_REDIRECT_URI",
    "http://localhost:8003/api/integrations/xero/callback",
)

# Alanube (DGII electronic invoicing — Dominican Republic)
ALANUBE_API_URL: str = os.getenv("ALANUBE_API_URL", "https://sandbox-api.alanube.co/dom/v1")
ALANUBE_JWT: str = os.getenv("ALANUBE_JWT", "")

# ===========================================================================
# Telegram Bot (admin notifications)
# ===========================================================================
# Bot token from @BotFather. The bot will send payment proof alerts here.
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
# Chat ID of the admin (or group) where alerts are sent.
TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")
