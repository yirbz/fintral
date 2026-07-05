"""Clean up pre-Lago database records and storage files.

Organizations and subscriptions created before the Lago billing implementation
(June 2026) lack Lago customer/subscription IDs. This script removes them
to keep billing data consistent with the new Lago-based system.

Usage:
    # Dry-run (report only, no changes):
    python scripts/cleanup_pre_lago.py

    # Execute cleanup:
    python scripts/cleanup_pre_lago.py --apply

    # Skip storage file deletion:
    python scripts/cleanup_pre_lago.py --apply --no-storage
"""

import argparse
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.models.billing_webhook_event import BillingWebhookEvent
from app.models.mio_payment_order import MioPaymentOrder
from app.models.organization import Organization
from app.models.organization_subscription import OrganizationSubscription
from app.models.payment_proof import PaymentProof

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)
logger = logging.getLogger(__name__)


def dry_run(db) -> dict:
    """Report what would be deleted without making changes."""
    report = {}

    # 1. BillingWebhookEvents from paddle (pre-Lago)
    paddle_events = (
        db.query(BillingWebhookEvent)
        .filter(BillingWebhookEvent.source == "paddle")
        .count()
    )
    report["paddle_webhook_events"] = paddle_events

    # 2. MioPaymentOrders without lago_invoice_id (pre-Lago)
    old_mio_orders = (
        db.query(MioPaymentOrder)
        .filter(MioPaymentOrder.lago_invoice_id.is_(None))
        .count()
    )
    report["mio_orders_no_lago"] = old_mio_orders

    # 3. Subscriptions without any Lago fields
    pre_lago_subs = (
        db.query(OrganizationSubscription)
        .filter(
            OrganizationSubscription.lago_customer_id.is_(None),
            OrganizationSubscription.lago_subscription_id.is_(None),
        )
        .count()
    )
    report["subscriptions_no_lago"] = pre_lago_subs

    # 4. PaymentProofs belonging to orgs without Lago subscriptions
    no_lago_org_ids = [
        row[0]
        for row in db.query(OrganizationSubscription.organization_id)
        .filter(
            OrganizationSubscription.lago_customer_id.is_(None),
            OrganizationSubscription.lago_subscription_id.is_(None),
        )
        .distinct()
        .all()
    ]
    orphan_proofs = (
        db.query(PaymentProof)
        .filter(PaymentProof.organization_id.in_(no_lago_org_ids))
        .count()
    ) if no_lago_org_ids else 0
    report["payment_proofs_orphan"] = orphan_proofs

    # 5. Orgs that have ONLY pre-Lago subscriptions and no invoice data
    from app.models import Invoice
    orgs_with_subs = set(no_lago_org_ids)
    deletable_orgs = 0
    if orgs_with_subs:
        for org_id in list(orgs_with_subs):
            invoice_count = (
                db.query(Invoice)
                .filter(Invoice.organization_id == org_id, Invoice.is_deleted.is_(False))
                .count()
            )
            if invoice_count == 0:
                deletable_orgs += 1
            else:
                orgs_with_subs.discard(org_id)
    report["orgs_soft_deletable"] = deletable_orgs

    return report


def execute_cleanup(db):
    """Execute the cleanup."""
    total_deleted = {}

    # 1. Delete Paddle webhook events
    deleted = (
        db.query(BillingWebhookEvent)
        .filter(BillingWebhookEvent.source == "paddle")
        .delete(synchronize_session=False)
    )
    total_deleted["paddle_webhook_events"] = deleted
    logger.info("  ✓ Deleted %d Paddle webhook events", deleted)

    # 2. Delete MioPaymentOrders without lago_invoice_id
    deleted = (
        db.query(MioPaymentOrder)
        .filter(MioPaymentOrder.lago_invoice_id.is_(None))
        .delete(synchronize_session=False)
    )
    total_deleted["mio_orders_no_lago"] = deleted
    logger.info("  ✓ Deleted %d MIO orders without lago_invoice_id", deleted)

    # 3. Collect org IDs without Lago subscriptions
    no_lago_org_ids = [
        row[0]
        for row in db.query(OrganizationSubscription.organization_id)
        .filter(
            OrganizationSubscription.lago_customer_id.is_(None),
            OrganizationSubscription.lago_subscription_id.is_(None),
        )
        .distinct()
        .all()
    ]

    # 4. Delete PaymentProofs of orgs without Lago
    if no_lago_org_ids:
        deleted = (
            db.query(PaymentProof)
            .filter(PaymentProof.organization_id.in_(no_lago_org_ids))
            .delete(synchronize_session=False)
        )
        total_deleted["payment_proofs"] = deleted
        logger.info("  ✓ Deleted %d payment proofs from pre-Lago orgs", deleted)

    # 5. Delete subscriptions without Lago fields
    deleted = (
        db.query(OrganizationSubscription)
        .filter(
            OrganizationSubscription.lago_customer_id.is_(None),
            OrganizationSubscription.lago_subscription_id.is_(None),
        )
        .delete(synchronize_session=False)
    )
    total_deleted["subscriptions_no_lago"] = deleted
    logger.info("  ✓ Deleted %d subscriptions without Lago fields", deleted)

    db.commit()

    # 6. Mark orgs with no invoices as soft-deleted
    if no_lago_org_ids:
        from app.models import Invoice
        for org_id in no_lago_org_ids:
            invoice_count = (
                db.query(Invoice)
                .filter(Invoice.organization_id == org_id, Invoice.is_deleted.is_(False))
                .count()
            )
            if invoice_count == 0:
                org = db.query(Organization).filter(Organization.id == org_id).first()
                if org:
                    from app.utils.dates import utc_now
                    org.is_deleted = True
                    org.deleted_at = utc_now()
                    total_deleted.setdefault("orgs_soft_deleted", 0)
                    total_deleted["orgs_soft_deleted"] += 1
        db.commit()

    if total_deleted.get("orgs_soft_deleted", 0) > 0:
        logger.info("  ✓ Soft-deleted %d organizations (no invoices)", total_deleted["orgs_soft_deleted"])

    return total_deleted


def main():
    parser = argparse.ArgumentParser(description="Clean up pre-Lago records")
    parser.add_argument("--apply", action="store_true", help="Execute cleanup (default: dry-run)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        report = dry_run(db)

        logger.info("")
        logger.info("╔══════════════════════════════════════════════╗")
        logger.info("║     Pre-Lago Cleanup: Dry Run Report       ║")
        logger.info("╠══════════════════════════════════════════════╣")
        logger.info("║  %-20s → %8s  ║", "Item", "Count")
        logger.info("╠══════════════════════════════════════════════╣")
        for key, count in report.items():
            label = key.replace("_", " ").title()
            logger.info("║  %-20s → %8d  ║", label, count)
        logger.info("╚══════════════════════════════════════════════╝")
        logger.info("")

        if not args.apply:
            logger.info("Dry-run complete. Pass --apply to execute.")
            return

        confirm = input("Type 'yes' to confirm deletion: ").strip().lower()
        if confirm != "yes":
            logger.info("Aborted.")
            return

        logger.info("")
        logger.info("Executing cleanup...")
        results = execute_cleanup(db)
        total = sum(results.values())

        logger.info("")
        logger.info("╔══════════════════════════════════════════════╗")
        logger.info("║     Cleanup Complete                        ║")
        logger.info("╠══════════════════════════════════════════════╣")
        for key, count in results.items():
            label = key.replace("_", " ").title()
            logger.info("║  %-20s → %8d  ║", label, count)
        logger.info("╠══════════════════════════════════════════════╣")
        logger.info("║  %-20s → %8d  ║", "Total", total)
        logger.info("╚══════════════════════════════════════════════╝")
    finally:
        db.close()


if __name__ == "__main__":
    main()
