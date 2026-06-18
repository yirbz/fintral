import asyncio
import logging
from datetime import datetime, time, timedelta, date
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import SessionLocal
from app.models.metrics_snapshot import MetricsSnapshot
from app.models.organization_subscription import OrganizationSubscription
from app.models.subscription_plan import SubscriptionPlan
from app.models.invoice import Invoice
from app.services.alert_hooks import Alert, alert_manager
from app.utils.dates import utc_now

logger = logging.getLogger(__name__)

RUN_HOUR = 0
RUN_MINUTE = 5  # Run at 00:05 UTC daily to capture previous day fully

def compute_and_store_daily_metrics(db: Session, target_date: date) -> MetricsSnapshot:
    """
    Computes MRR, subscription status/plan distribution, and saves to metrics_snapshots.
    """
    logger.info("Computing daily metrics snapshot for date: %s", target_date)

    # 1. Calculate MRR & active subscription count (only active, excluding trialing)
    subs = db.query(OrganizationSubscription).filter(OrganizationSubscription.status == "active").all()
    
    total_mrr_cents = 0
    active_subscriptions_count = len(subs)

    for sub in subs:
        plan = sub.plan
        if not plan:
            continue
        base_price = sub.custom_price_cents if sub.custom_price_cents is not None else plan.price_monthly_cents
        addon_price = (
            sub.addon_ecf_blocks * plan.addon_ecf_block_price_cents
            + sub.addon_ai_blocks * plan.addon_ai_block_price_cents
            + sub.addon_storage_blocks * plan.addon_storage_block_price_cents
            + sub.addon_entity_slots * plan.entity_slot_price_cents
        )
        total_mrr_cents += base_price + addon_price

    # 2. Distribution by plan
    plan_dist_raw = (
        db.query(SubscriptionPlan.display_name, func.count(OrganizationSubscription.id))
        .join(SubscriptionPlan, OrganizationSubscription.plan_id == SubscriptionPlan.id)
        .group_by(SubscriptionPlan.display_name)
        .all()
    )
    plan_distribution = {str(k): v for k, v in plan_dist_raw}

    # 3. Distribution by status
    status_dist_raw = (
        db.query(OrganizationSubscription.status, func.count(OrganizationSubscription.id))
        .group_by(OrganizationSubscription.status)
        .all()
    )
    status_distribution = {str(k): v for k, v in status_dist_raw}

    # 4. Save snapshot (or update if already exists)
    snapshot = db.query(MetricsSnapshot).filter(MetricsSnapshot.snapshot_date == target_date).first()
    if not snapshot:
        snapshot = MetricsSnapshot(snapshot_date=target_date)
        db.add(snapshot)
    
    snapshot.mrr_cents = total_mrr_cents
    snapshot.active_subscriptions_count = active_subscriptions_count
    snapshot.plan_distribution = plan_distribution
    snapshot.status_distribution = status_distribution

    db.commit()
    db.refresh(snapshot)
    logger.info("Metrics snapshot saved: MRR=%s, active_subs=%d", total_mrr_cents, active_subscriptions_count)
    return snapshot


async def check_cost_anomalies(db: Session, target_date: date) -> None:
    """
    Checks if target_date's AI cost is abnormally high compared to the 7-day average.
    """
    # 1. Total OpenAI cost for target_date
    target_start = datetime.combine(target_date, time.min)
    target_end = datetime.combine(target_date, time.max)
    
    target_cost = db.query(func.sum(Invoice.openai_cost_usd)).filter(
        Invoice.created_at >= target_start,
        Invoice.created_at <= target_end,
        Invoice.openai_cost_usd.isnot(None)
    ).scalar() or 0.0

    # 2. Get past 7 days' daily sums
    past_costs = []
    for i in range(1, 8):
        d = target_date - timedelta(days=i)
        d_start = datetime.combine(d, time.min)
        d_end = datetime.combine(d, time.max)
        day_cost = db.query(func.sum(Invoice.openai_cost_usd)).filter(
            Invoice.created_at >= d_start,
            Invoice.created_at <= d_end,
            Invoice.openai_cost_usd.isnot(None)
        ).scalar() or 0.0
        past_costs.append(day_cost)

    if not past_costs:
        return

    avg_cost = sum(past_costs) / len(past_costs)
    
    # 3. Anomaly check: target_cost > 2 * avg_cost (and avg_cost > 0.5 USD to avoid noise)
    if avg_cost > 0.5 and target_cost > 2 * avg_cost:
        logger.warning("AI Cost Anomaly detected for %s: %s USD vs avg of %s USD", target_date, target_cost, avg_cost)
        await alert_manager.dispatch(Alert(
            title="Anomalía de Costos de IA Detectada",
            message=f"El costo de IA para el día {target_date} fue de ${target_cost:.2f} USD, "
                    f"lo cual supera el doble del promedio diario de los últimos 7 días (${avg_cost:.2f} USD).",
            severity="warning",
            source="daily_metrics",
            metadata={
                "date": target_date.isoformat(),
                "cost_usd": target_cost,
                "7_day_average_usd": avg_cost,
                "history_usd": past_costs
            }
        ))


async def run_daily_metrics() -> None:
    db = SessionLocal()
    try:
        # Run for the previous day (since we run shortly after midnight UTC)
        yesterday = (utc_now() - timedelta(days=1)).date()
        compute_and_store_daily_metrics(db, yesterday)
        await check_cost_anomalies(db, yesterday)
    except Exception as exc:
        logger.exception("Error running daily metrics check: %s", exc)
    finally:
        db.close()


async def start_daily_metrics_task() -> None:
    asyncio.create_task(_daily_metrics_loop())


async def _daily_metrics_loop() -> None:
    logger.info(
        "Daily metrics aggregation scheduler started — runs daily at %02d:%02d UTC",
        RUN_HOUR,
        RUN_MINUTE
    )

    while True:
        try:
            now = utc_now()
            target = datetime.combine(now.date(), time(RUN_HOUR, RUN_MINUTE), tzinfo=now.tzinfo)
            # If we've already passed today's execution time, target tomorrow
            if now.time() >= time(RUN_HOUR, RUN_MINUTE):
                target += timedelta(days=1)

            wait_seconds = (target - now).total_seconds()
            logger.info("Daily metrics loop sleeping for %.1f seconds until %s", wait_seconds, target.isoformat())

            await asyncio.sleep(wait_seconds)
            await run_daily_metrics()
        except asyncio.CancelledError:
            logger.info("Daily metrics scheduler loop cancelled")
            break
        except Exception as exc:
            logger.exception("Error in daily metrics loop: %s", exc)
            await asyncio.sleep(3600)  # Wait 1 hour before retry on error
