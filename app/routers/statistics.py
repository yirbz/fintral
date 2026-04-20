from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.core.redis import get_cache_stats
from app.services.websocket import websocket_manager

from app.core.container import cost_control
from app.dependencies.auth import get_current_user_from_cookie
from app.dependencies.tenancy import get_org_id
from app.repositories import InvoiceRepository
from app.services import StatisticsService

router = APIRouter()
invoice_repo = InvoiceRepository()
statistics_service = StatisticsService(cost_control=cost_control)


@router.get("/statistics")
async def get_statistics(
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    stats_data = statistics_service.get_statistics(db, org_id)

    await websocket_manager.notify_statistics_update(stats_data, org_id)
    return stats_data


@router.get("/categories")
async def get_categories(
    user: Optional[User] = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="No autorizado")

    org_id = get_org_id(user, db)
    return invoice_repo.list_distinct_categories(db, org_id)


@router.get("/api/redis/stats")
async def get_redis_stats():
    stats = get_cache_stats()
    return {
        "redis": stats,
        "description": "Estadísticas de rendimiento del sistema de caché Redis",
    }
