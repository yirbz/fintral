"""Seed the four subscription plans into the database.

Run:  python -m app.services.seed_plans
"""
import logging
import sys
import os

# Ensure backend/ is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.database import SessionLocal
from app.models import SubscriptionPlan

logger = logging.getLogger(__name__)

PLANS = [
    {
        "name": "esencial",
        "display_name": "Esencial",
        "description": "Para profesionales independientes, freelancers y negocios de bajo volumen fiscal.",
        "price_monthly_cents": 2900,  # $29
        "extra_entity_price_cents": 0,
        "addon_ecf_block_size": 100,
        "addon_ecf_block_price_cents": 500,  # $5
        "addon_ai_block_size": 500,
        "addon_ai_block_price_cents": 1000,  # $10
        "addon_storage_block_mb": 10240,  # 10GB
        "addon_storage_block_price_cents": 500,  # $5
        "max_users": 2,
        "max_entities": 1,
        "max_ecf_monthly": 50,
        "max_ai_queries_monthly": 300,
        "max_ocr_docs_monthly": 30,
        "max_storage_mb": 500,
        "max_api_calls_monthly": 0,
        "max_ai_rate_per_minute": 10,
        "max_api_rate_per_minute": 0,
        "max_ocr_rate_per_minute": 5,
        "has_advanced_reports": False,
        "has_api_access": False,
        "has_webhooks": False,
        "has_sla": False,
        "has_ai_sidebar": True,
        "has_multi_entity_dashboard": False,
        "has_cross_company_history": False,
        "has_batch_ecf_generation": False,
        "soft_limit_enabled": True,
        "overage_unit_price_cents": 0,
        "sort_order": 10,
        "is_public": True,
        "is_enterprise": False,
    },
    {
        "name": "profesional",
        "display_name": "Profesional",
        "description": "Para PyMEs organizadas en crecimiento (flujo de RD$500K a RD$5M/mes). El más popular.",
        "price_monthly_cents": 6900,  # $69
        "extra_entity_price_cents": 0,
        "addon_ecf_block_size": 100,
        "addon_ecf_block_price_cents": 500,
        "addon_ai_block_size": 500,
        "addon_ai_block_price_cents": 1000,
        "addon_storage_block_mb": 10240,
        "addon_storage_block_price_cents": 500,
        "max_users": 5,
        "max_entities": 1,
        "max_ecf_monthly": 300,
        "max_ai_queries_monthly": 3000,
        "max_ocr_docs_monthly": 300,
        "max_storage_mb": 5120,  # 5GB
        "max_api_calls_monthly": 5000,
        "max_ai_rate_per_minute": 30,
        "max_api_rate_per_minute": 50,
        "max_ocr_rate_per_minute": 10,
        "has_advanced_reports": True,
        "has_api_access": True,
        "has_webhooks": False,
        "has_sla": False,
        "has_ai_sidebar": True,
        "has_multi_entity_dashboard": False,
        "has_cross_company_history": False,
        "has_batch_ecf_generation": False,
        "soft_limit_enabled": True,
        "overage_unit_price_cents": 88,  # $0.88/doc overage
        "sort_order": 20,
        "is_public": True,
        "is_enterprise": False,
    },
    {
        "name": "multi-entidad",
        "display_name": "Multi-Entidad",
        "description": "Para firmas de contabilidad, auditores independientes y profesionales con cartera de clientes.",
        "price_monthly_cents": 14900,  # $149
        "extra_entity_price_cents": 1200,  # $12/additional entity
        "addon_ecf_block_size": 100,
        "addon_ecf_block_price_cents": 500,
        "addon_ai_block_size": 500,
        "addon_ai_block_price_cents": 1000,
        "addon_storage_block_mb": 10240,
        "addon_storage_block_price_cents": 500,
        "max_users": 15,
        "max_entities": 10,
        "max_ecf_monthly": 5000,
        "max_ai_queries_monthly": 10000,
        "max_ocr_docs_monthly": 2000,
        "max_storage_mb": 25600,  # 25GB
        "max_api_calls_monthly": 25000,
        "max_ai_rate_per_minute": 60,
        "max_api_rate_per_minute": 100,
        "max_ocr_rate_per_minute": 20,
        "has_advanced_reports": True,
        "has_api_access": True,
        "has_webhooks": True,
        "has_sla": False,
        "has_ai_sidebar": True,
        "has_multi_entity_dashboard": True,
        "has_cross_company_history": True,
        "has_batch_ecf_generation": True,
        "soft_limit_enabled": True,
        "overage_unit_price_cents": 88,
        "sort_order": 30,
        "is_public": True,
        "is_enterprise": False,
    },
    {
        "name": "enterprise",
        "display_name": "Enterprise",
        "description": "Para grandes empresas o corporaciones con requerimientos a medida.",
        "price_monthly_cents": 29900,  # $299 (starting)
        "extra_entity_price_cents": 0,
        "addon_ecf_block_size": 500,
        "addon_ecf_block_price_cents": 2500,
        "addon_ai_block_size": 2000,
        "addon_ai_block_price_cents": 3000,
        "addon_storage_block_mb": 51200,
        "addon_storage_block_price_cents": 2000,
        "max_users": 999,
        "max_entities": 999,
        "max_ecf_monthly": 10000,
        "max_ai_queries_monthly": 30000,
        "max_ocr_docs_monthly": 10000,
        "max_storage_mb": 102400,  # 100GB
        "max_api_calls_monthly": 250000,
        "max_ai_rate_per_minute": 200,
        "max_api_rate_per_minute": 500,
        "max_ocr_rate_per_minute": 100,
        "has_advanced_reports": True,
        "has_api_access": True,
        "has_webhooks": True,
        "has_sla": True,
        "has_ai_sidebar": True,
        "has_multi_entity_dashboard": True,
        "has_cross_company_history": True,
        "has_batch_ecf_generation": True,
        "soft_limit_enabled": True,
        "overage_unit_price_cents": 50,  # negotiated overage
        "sort_order": 40,
        "is_public": True,
        "is_enterprise": True,
    },
]


def seed_plans():
    """Insert plans if they don't already exist."""
    db = SessionLocal()
    try:
        existing = {p.name for p in db.query(SubscriptionPlan).all()}
        created = 0
        for data in PLANS:
            if data["name"] in existing:
                logger.info("⏭️  Plan '%s' already exists, skipping", data["name"])
                continue
            plan = SubscriptionPlan(**data)
            db.add(plan)
            created += 1

        db.commit()
        logger.info("✅ Seeded %d plans (total: %d)", created, len(existing) + created)

        # Verify
        for p in db.query(SubscriptionPlan).order_by(SubscriptionPlan.sort_order).all():
            logger.info("  • %s — $%.2f/mo", p.display_name, p.price_monthly_cents / 100)

    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    seed_plans()
