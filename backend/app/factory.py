import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.database import get_db

from app.config import SUPABASE_URL
from app.core.bootstrap import run_startup
from app.core.ui import ensure_runtime_dirs, templates
from app.routers import admin, auth_pages, dgii, evolution, integrations, invoices, notifications, odoo_integration, quickbooks_integration, settings, statistics, websocket, webhooks, xero_integration
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

    app.mount("/static", StaticFiles(directory="static"), name="static")

    @app.exception_handler(404)
    async def not_found_exception_handler(request: Request, exc: StarletteHTTPException):
        if request.url.path.startswith("/api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return templates.TemplateResponse("404.html", {"request": request}, status_code=404)

    @app.exception_handler(500)
    async def internal_server_error_handler(request: Request, exc: Exception):
        if request.url.path.startswith("/api/"):
            return JSONResponse({"detail": "Internal Server Error"}, status_code=500)
        return templates.TemplateResponse("500.html", {"request": request}, status_code=500)

    @app.on_event("startup")
    async def startup_event():
        db = next(get_db())
        try:
            await run_startup(db)
        finally:
            db.close()
        await start_cleanup_task()

    # Admin
    app.include_router(admin.router)

    # Router registration (path parity)
    app.include_router(auth_pages.router)
    app.include_router(notifications.router)
    app.include_router(settings.router)
    app.include_router(invoices.router)
    app.include_router(webhooks.router)
    app.include_router(integrations.router)
    app.include_router(odoo_integration.router)
    app.include_router(quickbooks_integration.router)
    app.include_router(xero_integration.router)
    app.include_router(statistics.router)
    app.include_router(evolution.router)
    app.include_router(websocket.router)
    app.include_router(dgii.router)

    return app
