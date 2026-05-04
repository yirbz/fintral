from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.redis import get_cache_stats
from app.services.websocket import websocket_manager

from app.core.container import cost_control
from app.dependencies.tenant import TenantContext, require_tenant
from app.repositories import InvoiceRepository
from app.services import StatisticsService

router = APIRouter()
invoice_repo = InvoiceRepository()
statistics_service = StatisticsService(cost_control=cost_control)


@router.get("/statistics")
async def get_statistics(
    ctx: TenantContext = Depends(require_tenant),
):
    stats_data = statistics_service.get_statistics(ctx.db, ctx.tenant_id, ctx.org_id)

    await websocket_manager.notify_statistics_update(stats_data, str(ctx.org_id))
    return stats_data


@router.get("/categories")
async def get_categories(
    ctx: TenantContext = Depends(require_tenant),
):
    return invoice_repo.list_distinct_categories(ctx.db, ctx.tenant_id, ctx.org_id)


@router.get("/api/redis/stats")
async def get_redis_stats():
    stats = get_cache_stats()
    return {
        "redis": stats,
        "description": "Estadísticas de rendimiento del sistema de caché Redis",
    }
