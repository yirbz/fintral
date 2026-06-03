"""
UsageTracker — records and queries resource consumption per org per cycle.

Leverages Redis for real-time rate-limit windows, PostgreSQL for monthly
aggregates. Designed for high throughput — AI queries, e-CF emissions,
OCR documents, and API calls all flow through here.
"""
import json
import logging
from datetime import datetime, date
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.redis import get_redis_client
from app.models import UsageRecord, Organization

logger = logging.getLogger(__name__)

# Redis key patterns
REDIS_AI_MINUTE_KEY = "ratelimit:ai:{org_id}:{ymd_hm}"
REDIS_API_MINUTE_KEY = "ratelimit:api:{org_id}:{ymd_hm}"
REDIS_OCR_MINUTE_KEY = "ratelimit:ocr:{org_id}:{ymd_hm}"


def _current_cycle() -> int:
    """Return YYYYMM integer for current month."""
    d = date.today()
    return d.year * 100 + d.month


class UsageTracker:
    """Tracks usage counters and rate-limit windows per organization."""

    def __init__(self, db: Session):
        self.db = db

    # ── Getters ─────────────────────────────────────────────────────

    def get_current_usage(self, org_id, plan_limits: dict) -> dict:
        """Return current cycle usage + percentage for each resource."""
        cycle = _current_cycle()
        record = (
            self.db.query(UsageRecord)
            .filter(
                UsageRecord.organization_id == org_id,
                UsageRecord.cycle == cycle,
            )
            .first()
        )
        if not record:
            return {
                "cycle": cycle,
                "ecf": {"used": 0, "limit": plan_limits.get("max_ecf_monthly", 0), "pct": 0},
                "ai_queries": {"used": 0, "limit": plan_limits.get("max_ai_queries_monthly", 0), "pct": 0},
                "ocr_docs": {"used": 0, "limit": plan_limits.get("max_ocr_docs_monthly", 0), "pct": 0},
                "storage_mb": {"used": 0, "limit": plan_limits.get("max_storage_mb", 0), "pct": 0},
                "api_calls": {"used": 0, "limit": plan_limits.get("max_api_calls_monthly", 0) or 0, "pct": 0},
            }

        limits = {
            "ecf": plan_limits.get("max_ecf_monthly", 0),
            "ai_queries": plan_limits.get("max_ai_queries_monthly", 0),
            "ocr_docs": plan_limits.get("max_ocr_docs_monthly", 0),
            "storage_mb": plan_limits.get("max_storage_mb", 0),
            "api_calls": plan_limits.get("max_api_calls_monthly", 0) or 0,
        }
        storage_mb = record.storage_bytes / (1024 * 1024) if record.storage_bytes else 0

        def pct(used, limit_val):
            if limit_val <= 0:
                return 0
            return round((used / limit_val) * 100, 1)

        return {
            "cycle": cycle,
            "ecf": {"used": record.ecf_count, "limit": limits["ecf"], "pct": pct(record.ecf_count, limits["ecf"])},
            "ai_queries": {"used": record.ai_query_count, "limit": limits["ai_queries"], "pct": pct(record.ai_query_count, limits["ai_queries"])},
            "ocr_docs": {"used": record.ocr_doc_count, "limit": limits["ocr_docs"], "pct": pct(record.ocr_doc_count, limits["ocr_docs"])},
            "storage_mb": {"used": round(storage_mb, 2), "limit": limits["storage_mb"], "pct": pct(storage_mb, limits["storage_mb"])},
            "api_calls": {"used": record.api_call_count, "limit": limits["api_calls"], "pct": pct(record.api_call_count, limits["api_calls"])},
        }

    # ── Increment counters ──────────────────────────────────────────

    def increment_ecf(self, org_id, amount: int = 1):
        """Increment e-CF counter for the current cycle."""
        self._increment(org_id, "ecf_count", amount)

    def increment_ai_query(self, org_id, amount: int = 1):
        """Increment AI query counter."""
        self._increment(org_id, "ai_query_count", amount)

    def increment_ocr_doc(self, org_id, amount: int = 1):
        """Increment OCR document counter."""
        self._increment(org_id, "ocr_doc_count", amount)

    def increment_api_call(self, org_id, amount: int = 1):
        """Increment API call counter (non-AI, non-OCR)."""
        self._increment(org_id, "api_call_count", amount)

    def set_storage_bytes(self, org_id, bytes_val: int):
        """Set storage usage (absolute, not incremental).
        Call this after each file upload/delete to keep it in sync."""
        cycle = _current_cycle()
        record = self._get_or_create(org_id, cycle)
        record.storage_bytes = bytes_val
        self.db.commit()

    def _increment(self, org_id, column: str, amount: int = 1):
        """Atomic upsert + increment for a counter column."""
        cycle = _current_cycle()
        record = self._get_or_create(org_id, cycle)
        current = getattr(record, column, 0)
        setattr(record, column, current + amount)
        self.db.commit()

    def _get_or_create(self, org_id, cycle: int) -> UsageRecord:
        """Find existing UsageRecord for this org+cycle or create one."""
        record = (
            self.db.query(UsageRecord)
            .filter(
                UsageRecord.organization_id == org_id,
                UsageRecord.cycle == cycle,
            )
            .first()
        )
        if record:
            return record

        record = UsageRecord(
            organization_id=org_id,
            cycle=cycle,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        return record

    # ── Rate-limit windows (Redis-backed) ───────────────────────────

    def check_rate_limit(
        self, org_id, limit_type: str, max_per_minute: int
    ) -> dict:
        """Check if org has exceeded per-minute rate limit.

        limit_type: 'ai' | 'api' | 'ocr'
        Returns dict with allowed, current, limit, retry_after_seconds.
        """
        if max_per_minute <= 0:
            return {"allowed": False, "reason": "not_available", "current": 0, "limit": 0}

        redis = get_redis_client()
        if redis is None:
            return {"allowed": True, "reason": None, "current": 0, "limit": max_per_minute}

        now = datetime.utcnow()
        key_map = {"ai": REDIS_AI_MINUTE_KEY, "api": REDIS_API_MINUTE_KEY, "ocr": REDIS_OCR_MINUTE_KEY}
        key = key_map.get(limit_type, REDIS_AI_MINUTE_KEY).format(
            org_id=str(org_id), ymd_hm=now.strftime("%Y%m%d_%H%M")
        )

        pipe = redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, 65)  # TTL 65s — a bit more than 1 minute
        current_val, _ = pipe.execute()

        if current_val > max_per_minute:
            return {
                "allowed": False,
                "reason": f"rate_limit_{limit_type}",
                "current": current_val,
                "limit": max_per_minute,
                "retry_after_seconds": 60 - now.second,
            }

        return {"allowed": True, "reason": None, "current": current_val, "limit": max_per_minute}

    # ── Soft limit notifications ────────────────────────────────────

    def check_and_notify(self, org_id, usage_data: dict, plan_limits: dict) -> list[dict]:
        """Check all limits and return alerts for any at 80% or 100%.

        Returns list of alert dicts. Caller should send notifications.
        """
        cycle = _current_cycle()
        record = self._get_or_create(org_id, cycle)
        alerts = []

        checks = [
            ("ecf_count", "max_ecf_monthly", "ecf", "Comprobantes electrónicos (e-CF)"),
            ("ai_query_count", "max_ai_queries_monthly", "ai", "Consultas AI"),
            ("ocr_doc_count", "max_ocr_docs_monthly", "ocr", "Documentos OCR"),
        ]

        for field, limit_field, resource_label, display_name in checks:
            used = getattr(record, field, 0)
            limit_val = plan_limits.get(limit_field, 0)
            if limit_val <= 0:
                continue
            pct_val = round((used / limit_val) * 100, 1)

            if pct_val >= 100 and not record.soft_limit_100pct_notified:
                record.soft_limit_100pct_notified = True
                alerts.append({
                    "alert_type": f"100pct_{resource_label}",
                    "pct_used": int(pct_val),
                    "current_usage": used,
                    "limit_value": limit_val,
                    "message": (
                        f"Has alcanzado el 100% de tu límite mensual de {display_name} "
                        f"({used}/{limit_val}). Se activarán cargos por excedente o "
                        f"contrata un add-on para continuar sin interrupciones."
                    ),
                })

            elif pct_val >= 80 and not record.soft_limit_80pct_notified:
                record.soft_limit_80pct_notified = True
                alerts.append({
                    "alert_type": f"80pct_{resource_label}",
                    "pct_used": int(pct_val),
                    "current_usage": used,
                    "limit_value": limit_val,
                    "message": (
                        f"Has utilizado el {pct_val}% de tu límite mensual de {display_name} "
                        f"({used}/{limit_val}). Considera mejorar tu plan o contratar un add-on."
                    ),
                })

        if alerts:
            self.db.commit()

        return alerts
