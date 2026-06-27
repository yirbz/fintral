"""PaddleSyncService — reconciles Paddle subscription state with local DB.

Run as a periodic CRON job to catch missed webhooks or drift.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.organization_subscription import OrganizationSubscription
from app.services.paddle_service import PaddleService

logger = logging.getLogger(__name__)

SUBSCRIPTION_STATUS_MAP = {
    "active": "active",
    "trialing": "trialing",
    "paused": "suspended",
    "past_due": "past_due",
    "canceled": "canceled",
    "expired": "expired",
}


class PaddleSyncService:
    """Reconcile Paddle subscription state with local OrganizationSubscription records."""

    def __init__(self, db: Session, paddle_service: PaddleService | None = None):
        self.db = db
        self.paddle = paddle_service or PaddleService()

    def reconcile_all(self) -> dict[str, Any]:
        """Check every local sub that has a paddle_subscription_id against Paddle.

        Returns summary of discrepancies found and fixed.
        """
        stats = {"checked": 0, "fixed": 0, "errors": 0, "details": []}

        subs = (
            self.db.query(OrganizationSubscription)
            .filter(OrganizationSubscription.paddle_subscription_id.isnot(None))
            .all()
        )

        for sub in subs:
            try:
                result = self._reconcile_one(sub)
                if result["drifted"]:
                    stats["fixed"] += 1
                stats["checked"] += 1
                stats["details"].append(result)
            except Exception as exc:
                stats["errors"] += 1
                logger.exception("Failed to reconcile sub %s: %s", sub.id, exc)

        return stats

    def reconcile_one(self, sub_id: str) -> dict[str, Any] | None:
        """Reconcile a single local subscription by its local UUID."""
        sub = (
            self.db.query(OrganizationSubscription)
            .filter(OrganizationSubscription.id == sub_id)
            .first()
        )
        if not sub or not sub.paddle_subscription_id:
            return None
        return self._reconcile_one(sub)

    def _reconcile_one(self, sub: OrganizationSubscription) -> dict[str, Any]:
        result = {
            "local_id": str(sub.id),
            "paddle_id": sub.paddle_subscription_id,
            "local_status": sub.status,
            "paddle_status": None,
            "drifted": False,
            "changes": [],
        }

        try:
            remote = self.paddle.get_subscription(sub.paddle_subscription_id)
        except Exception as exc:
            result["error"] = str(exc)
            return result

        remote_status = remote.get("status", "")
        result["paddle_status"] = remote_status

        mapped = SUBSCRIPTION_STATUS_MAP.get(remote_status)
        if mapped and mapped != sub.status:
            result["drifted"] = True
            result["changes"].append(
                f"status: {sub.status} → {mapped} (remote: {remote_status})"
            )
            sub.status = mapped

        period = remote.get("current_billing_period")
        if period:
            import dateutil.parser
            remote_start = period.get("starts_at")
            remote_end = period.get("ends_at")
            local_start = (
                sub.current_billing_period_start.isoformat()
                if sub.current_billing_period_start
                else None
            )
            local_end = (
                sub.current_billing_period_end.isoformat()
                if sub.current_billing_period_end
                else None
            )
            if remote_start and remote_start != local_start:
                try:
                    sub.current_billing_period_start = dateutil.parser.parse(remote_start)
                    result["changes"].append("updated billing_period_start")
                    result["drifted"] = True
                except Exception:
                    pass
            if remote_end and remote_end != local_end:
                try:
                    sub.current_billing_period_end = dateutil.parser.parse(remote_end)
                    result["changes"].append("updated billing_period_end")
                    result["drifted"] = True
                except Exception:
                    pass

        if result["drifted"]:
            self.db.commit()
            logger.info(
                "Reconciled sub %s: %s",
                sub.paddle_subscription_id,
                "; ".join(result["changes"]),
            )
        else:
            self.db.commit()

        return result
