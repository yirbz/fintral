import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.database import get_db

from app.config import FINTRAL_DATA_DIR, IS_PRODUCTION, SUPABASE_URL
from app.core.bootstrap import run_startup
from app.core.ui import ensure_runtime_dirs
from app.routers import admin, alanube_sync, auth_pages, dgii, evolution, history, integrations, invitations, invoices, mio, notifications, odoo_integration, organizations, pending_uploads, quickbooks_integration, settings, statistics, websocket, webhooks, xero_integration, bank_accounts, billing, ai_chat, plans, reports, support_chat
from app.services.cleanup_service import start_cleanup_task

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    ensure_runtime_dirs()
    if SUPABASE_URL:
        from app.services.supabase_storage import ensure_bucket
        ensure_bucket()
    else:
        logger.info("Supabase not configured (SUPABASE_URL empty) — storage and auth features disabled")

    app = FastAPI(title="Sistema de Gestión de Facturas", version="1.0.0")

    static_dir = os.path.join(FINTRAL_DATA_DIR, "static")
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

    @app.exception_handler(404)
    async def not_found_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse({"detail": "Not Found"}, status_code=404)

    @app.exception_handler(500)
    async def internal_server_error_handler(request: Request, exc: Exception):
        return JSONResponse({"detail": "Internal Server Error"}, status_code=500)

    @app.on_event("startup")
    async def startup_event():
        db = next(get_db())
        try:
            await run_startup(db)
        finally:
            db.close()
        if IS_PRODUCTION:
            await start_cleanup_task()
        else:
            logger.info("Skipping cleanup task in DEVELOPMENT mode")

    # Admin
    app.include_router(admin.router)

    # Router registration (path parity)
    app.include_router(auth_pages.router)
    app.include_router(notifications.router)
    app.include_router(pending_uploads.router)
    app.include_router(settings.router)
    app.include_router(invitations.router)
    app.include_router(invoices.router)
    app.include_router(webhooks.router)
    app.include_router(history.router)
    app.include_router(integrations.router)
    app.include_router(odoo_integration.router)
    app.include_router(quickbooks_integration.router)
    app.include_router(xero_integration.router)
    app.include_router(statistics.router)
    app.include_router(evolution.router)
    app.include_router(organizations.router)
    app.include_router(websocket.router)
    app.include_router(dgii.router)
    app.include_router(reports.router)
    app.include_router(bank_accounts.router)
    app.include_router(billing.router)

    # Alanube received documents sync
    app.include_router(alanube_sync.router)

    # AI Chat
    app.include_router(ai_chat.router)

    # MIO (GeoPagos) payments
    app.include_router(mio.router)

    # Credit notes — now unified into invoices table. Router removed.
    # Endpoints migrated to invoices router.

    # Plans & Subscriptions
    app.include_router(plans.router)

    # Support Chat
    app.include_router(support_chat.router)

    return app
