import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import IS_POSTGRES
from app.models import Invoice
from app.core.redis import cache_get, cache_set

logger = logging.getLogger(__name__)


class StatisticsService:
    def __init__(self, cost_control: Any):
        self.cost_control = cost_control

    @staticmethod
    def _resolve_period_days(period: Optional[str]) -> int:
        mapping = {
            "7d": 7,
            "30d": 30,
            "90d": 90,
        }
        return mapping.get((period or "30d").lower(), 30)

    def _build_alert_distribution(self, alert_invoices: list[tuple[str]]) -> dict:
        alert_breakdown: dict[str, int] = {}

        for (flags_json,) in alert_invoices:
            try:
                if not flags_json:
                    continue
                flags = json.loads(flags_json)
                if not isinstance(flags, list):
                    continue
                for flag in flags:
                    text = str(flag).lower()
                    category = "Otros"
                    if "fiscal" in text or "tax" in text:
                        category = "Datos Fiscales"
                    elif "duplicado" in text:
                        category = "Duplicados"
                    elif "antigua" in text or "fecha" in text:
                        category = "Antigüedad"
                    elif "legible" in text:
                        category = "Legibilidad"
                    elif "impuestos" in text or "itbis" in text:
                        category = "Impuestos"
                    alert_breakdown[category] = alert_breakdown.get(category, 0) + 1
            except Exception:  # noqa: BLE001
                continue

        return {
            "labels": list(alert_breakdown.keys()),
            "data": list(alert_breakdown.values()),
        }

    def _volume_history(self, db: Session, tenant_id: UUID, org_id: UUID, days: int = 7) -> list[dict]:
        base_filter = [
            Invoice.processed.is_(True),
            Invoice.updated_at >= datetime.now() - timedelta(days=days),
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
        ]

        if IS_POSTGRES:
            rows = (
                db.query(
                    func.to_char(Invoice.updated_at, "YYYY-MM-DD").label("day"),
                    func.count(Invoice.id).label("count"),
                )
                .filter(*base_filter)
                .group_by(func.to_char(Invoice.updated_at, "YYYY-MM-DD"))
                .order_by(func.to_char(Invoice.updated_at, "YYYY-MM-DD"))
                .all()
            )
        else:
            rows = (
                db.query(
                    func.strftime("%Y-%m-%d", Invoice.updated_at).label("day"),
                    func.count(Invoice.id).label("count"),
                )
                .filter(*base_filter)
                .group_by(func.strftime("%Y-%m-%d", Invoice.updated_at))
                .order_by(func.strftime("%Y-%m-%d", Invoice.updated_at))
                .all()
            )

        return [{"date": day, "count": count} for day, count in rows]

    def _monthly_stats(self, db: Session, tenant_id: UUID, org_id: UUID, days: int = 180) -> list[dict]:
        start = datetime.now() - timedelta(days=days)
        base_filter = [
            Invoice.processed.is_(True),
            Invoice.updated_at >= start,
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
        ]

        if days <= 31:
            if IS_POSTGRES:
                rows = (
                    db.query(
                        func.to_char(Invoice.updated_at, "YYYY-MM-DD").label("day"),
                        func.count(Invoice.id).label("count"),
                    )
                    .filter(*base_filter)
                    .group_by(func.to_char(Invoice.updated_at, "YYYY-MM-DD"))
                    .order_by(func.to_char(Invoice.updated_at, "YYYY-MM-DD"))
                    .all()
                )
            else:
                rows = (
                    db.query(
                        func.strftime("%Y-%m-%d", Invoice.updated_at).label("day"),
                        func.count(Invoice.id).label("count"),
                    )
                    .filter(*base_filter)
                    .group_by(func.strftime("%Y-%m-%d", Invoice.updated_at))
                    .order_by(func.strftime("%Y-%m-%d", Invoice.updated_at))
                    .all()
                )
            return [{"month": day, "count": count} for day, count in rows]

        if IS_POSTGRES:
            rows = (
                db.query(
                    func.to_char(Invoice.updated_at, "YYYY-MM").label("month"),
                    func.count(Invoice.id).label("count"),
                )
                .filter(*base_filter)
                .group_by(func.to_char(Invoice.updated_at, "YYYY-MM"))
                .order_by(func.to_char(Invoice.updated_at, "YYYY-MM"))
                .all()
            )
        else:
            rows = (
                db.query(
                    func.strftime("%Y-%m", Invoice.updated_at).label("month"),
                    func.count(Invoice.id).label("count"),
                )
                .filter(*base_filter)
                .group_by(func.strftime("%Y-%m", Invoice.updated_at))
                .order_by(func.strftime("%Y-%m", Invoice.updated_at))
                .all()
            )

        return [{"month": month, "count": count} for month, count in rows]

    def _category_breakdown(self, db: Session, tenant_id: UUID, org_id: UUID) -> list[dict]:
        rows = (
            db.query(
                Invoice.category,
                func.count(Invoice.id).label("count"),
                func.sum(Invoice.total_amount).label("total"),
            )
            .filter(
                Invoice.tenant_id == tenant_id,
                Invoice.organization_id == org_id,
                Invoice.processed.is_(True),
                Invoice.category.isnot(None),
            )
            .group_by(Invoice.category)
            .order_by(func.sum(Invoice.total_amount).desc())
            .all()
        )

        return [
            {
                "category": category or "Sin categoría",
                "count": int(count or 0),
                "total": float(total or 0.0),
            }
            for category, count, total in rows
        ]

    def _totals_by_transaction(self, db: Session, tenant_id: UUID, org_id: UUID) -> dict:
        base_filter = [
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
            Invoice.processed.is_(True),
        ]

        income_amount = (
            db.query(func.sum(Invoice.total_amount))
            .filter(*base_filter, Invoice.transaction_type == "income")
            .scalar()
            or 0.0
        )
        expense_amount = (
            db.query(func.sum(Invoice.total_amount))
            .filter(*base_filter, Invoice.transaction_type == "expense")
            .scalar()
            or 0.0
        )
        income_count = (
            db.query(Invoice)
            .filter(*base_filter, Invoice.transaction_type == "income")
            .count()
        )
        expense_count = (
            db.query(Invoice)
            .filter(*base_filter, Invoice.transaction_type == "expense")
            .count()
        )

        return {
            "income": {"amount": float(income_amount), "count": income_count},
            "expense": {"amount": float(expense_amount), "count": expense_count},
            "net": float(income_amount - expense_amount),
        }

    def get_statistics(self, db: Session, tenant_id: UUID, org_id: UUID, period: Optional[str] = None) -> dict:
        period_days = self._resolve_period_days(period)
        period_key = period or "30d"
        cache_key = f"stats:dashboard:{tenant_id}:{org_id}:{period_key}"
        cached = cache_get(cache_key)
        if cached:
            logger.info("⚡ Estadísticas servidas desde caché Redis")
            return cached

        base_filter = [
            Invoice.tenant_id == tenant_id,
            Invoice.organization_id == org_id,
        ]
        base_query = db.query(Invoice).filter(*base_filter)
        total_invoices = base_query.count()
        processed_invoices = base_query.filter(Invoice.processed.is_(True)).count()
        pending_invoices = total_invoices - processed_invoices

        today = datetime.utcnow().date()
        today_start = datetime.combine(today, datetime.min.time())

        daily_processed_count = (
            db.query(Invoice)
            .filter(*base_filter, Invoice.processed.is_(True), Invoice.updated_at >= today_start)
            .count()
        )

        avg_confidence = (
            db.query(func.avg(Invoice.confidence_score))
            .filter(
                *base_filter,
                Invoice.processed.is_(True),
                Invoice.confidence_score.isnot(None),
            )
            .scalar()
            or 0.0
        )

        audit_alert_count = (
            db.query(Invoice)
            .filter(
                *base_filter,
                Invoice.processed.is_(True),
                Invoice.audit_flags != "[]",
                Invoice.audit_flags.isnot(None),
            )
            .count()
        )

        alert_invoices = (
            db.query(Invoice.audit_flags)
            .filter(
                *base_filter,
                Invoice.processed.is_(True),
                Invoice.audit_flags != "[]",
                Invoice.audit_flags.isnot(None),
            )
            .all()
        )

        audit_distribution = self._build_alert_distribution(alert_invoices)
        processing_history = self._volume_history(db, tenant_id, org_id, days=period_days)
        monthly_stats = self._monthly_stats(db, tenant_id, org_id, days=max(period_days, 30))
        categories = self._category_breakdown(db, tenant_id, org_id)
        totals = self._totals_by_transaction(db, tenant_id, org_id)

        cost_stats = self.cost_control.get_cost_statistics(db, org_id=str(org_id))

        avg_cost_per_doc = 0.0
        if processed_invoices > 0:
            avg_cost_per_doc = cost_stats.get("total_cost", 0) / processed_invoices

        recent_alerts_query = (
            db.query(Invoice)
            .filter(
                *base_filter,
                Invoice.processed.is_(True),
                Invoice.audit_flags != "[]",
                Invoice.audit_flags.isnot(None),
            )
            .order_by(Invoice.updated_at.desc())
            .limit(10)
            .all()
        )

        recent_alerts = [inv.to_dict() for inv in recent_alerts_query]

        stats_data = {
            "queue": {
                "pending": pending_invoices,
                "processed_total": processed_invoices,
                "total": total_invoices,
            },
            "performance": {
                "daily_processed": daily_processed_count,
                "avg_confidence": float(avg_confidence),
                "avg_processing_time": 0,
                "success_rate": (processed_invoices / total_invoices * 100) if total_invoices > 0 else 0,
            },
            "audit": {
                "alerts_count": audit_alert_count,
                "clean_count": max(processed_invoices - audit_alert_count, 0),
                "recent_alerts": recent_alerts,
                "distribution": audit_distribution,
            },
            "costs": {
                "avg_cost_per_doc": float(avg_cost_per_doc),
                "total_tokens": cost_stats.get("total_tokens", 0),
                "total_cost": cost_stats.get("total_cost", 0),
                "model_breakdown": cost_stats.get("model_breakdown", []),
            },
            "charts": {
                "volume_history": processing_history,
                "period": period_key,
            },
            "general": {
                "pending_invoices": pending_invoices,
                "total_invoices": total_invoices,
                "processed_invoices": processed_invoices,
                "processing_rate": (processed_invoices / total_invoices * 100) if total_invoices > 0 else 0,
            },
            # Compatibility fields for legacy/report UI
            "categories": categories,
            "monthly_stats": monthly_stats,
            "totals": totals,
            "openai_costs": cost_stats,
        }

        cache_set(cache_key, stats_data, ttl=300)
        logger.info("💾 Estadísticas operativas guardadas en caché Redis")
        return stats_data
