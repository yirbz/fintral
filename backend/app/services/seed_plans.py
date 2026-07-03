"""Seed the subscription plans into the database.

Aligns with the products shown on /plans and /docs pages:
  - Inicial      — RD$ 999/mo   — 1 free entity, RD$ 600/mo extra
  - Profesional   — RD$ 2,999/mo — 5 free entities, RD$ 600/mo extra
  - Despacho Contable — RD$ 7,999/mo — 20 free entities, RD$ 600/mo extra

Addon pricing (DOP, cost basis $0.087 USD/e-CF ≈ RD$5.22):
  - Bloque 100 e-CF:   RD$ 950 (cost RD$522 → 45% margin)
  - AI 500 queries:    RD$ 600
  - Storage 10GB:      RD$ 300
  - Extra entity slot: RD$ 600/mo (beyond plan limit)

IMPORTANT: Plans no longer include e-CF. Entities purchase document blocks
separately. Entity addon prices (extra_entity, billing_entity) are
DEPRECATED and always 0.

Run:  python -m app.services.seed_plans
"""
import logging
import sys
import os

# Ensure backend/ is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.database import SessionLocal
from app.models import SubscriptionPlan
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

PLANS = [
    {
        "name": "inicial",
        "display_name": "Inicial",
        "description": "Para profesionales independientes, freelancers y negocios que desean automatizar su contabilidad con herramientas de IA.",
        "currency": "DOP",
        "price_monthly_cents": 99900,  # RD$ 999.00
        "price_usd": 16.49,
        "extra_entity_price_cents": 0,  # DEPRECATED
        "extra_billing_entity_price_cents": 0,  # DEPRECATED
        "entity_slot_price_cents": 60000,  # RD$ 600 / extra entity slot
        "user_slot_price_cents": 30000,  # RD$ 300 / extra user slot
        "addon_ecf_block_size": 100,
        "addon_ecf_block_price_cents": 95000,  # RD$ 950 / 100 e-CF block (45% margin)
        "addon_ai_block_size": 500,
        "addon_ai_block_price_cents": 60000,  # RD$ 600 / 500 AI queries
        "addon_storage_block_mb": 10240,  # 10 GB
        "addon_storage_block_price_cents": 30000,  # RD$ 300
        "addon_ocr_block_size": 100,
        "addon_ocr_block_price_cents": 50000,  # RD$ 500 / 100 docs
        "max_users": 3,
        "max_entities": 1,
        "max_ecf_monthly": 0,  # e-CF comes from purchased blocks
        "max_ai_queries_monthly": 150,
        "max_ocr_docs_monthly": 50,
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
        # Overage no longer applies to plans — documents are pre-purchased
        "overage_unit_price_cents": 1200,  # RD$ 12.00 / doc pay-as-you-go
        "sort_order": 10,
        "is_public": True,
        "is_enterprise": False,
    },
    {
        "name": "profesional",
        "display_name": "Profesional",
        "description": "Para PyMEs en crecimiento que necesitan emitir facturas electrónicas (e-CF) válidas ante la DGII, con automatización fiscal completa.",
        "currency": "DOP",
        "price_monthly_cents": 299900,  # RD$ 2,999.00
        "price_usd": 47.99,
        "extra_entity_price_cents": 0,  # DEPRECATED
        "extra_billing_entity_price_cents": 0,  # DEPRECATED
        "entity_slot_price_cents": 60000,
        "user_slot_price_cents": 30000,
        "addon_ecf_block_size": 100,
        "addon_ecf_block_price_cents": 95000,
        "addon_ai_block_size": 500,
        "addon_ai_block_price_cents": 60000,
        "addon_storage_block_mb": 10240,
        "addon_storage_block_price_cents": 30000,
        "addon_ocr_block_size": 100,
        "addon_ocr_block_price_cents": 50000,  # RD$ 500 / 100 docs
        "max_users": 10,
        "max_entities": 5,
        "max_ecf_monthly": 0,  # e-CF comes from purchased blocks
        "max_ai_queries_monthly": 1000,
        "max_ocr_docs_monthly": 500,
        "max_storage_mb": 5120,
        "max_api_calls_monthly": 5000,
        "max_ai_rate_per_minute": 30,
        "max_api_rate_per_minute": 50,
        "max_ocr_rate_per_minute": 10,
        "has_advanced_reports": True,
        "has_api_access": True,
        "has_webhooks": True,
        "has_sla": False,
        "has_ai_sidebar": True,
        "has_multi_entity_dashboard": False,
        "has_cross_company_history": False,
        "has_batch_ecf_generation": False,
        "soft_limit_enabled": True,
        "overage_unit_price_cents": 1200,  # RD$ 12.00 / doc pay-as-you-go
        "sort_order": 20,
        "is_public": True,
        "is_enterprise": False,
    },
    {
        "name": "despacho",
        "display_name": "Despacho Contable",
        "description": "Para firmas de contabilidad, auditores y profesionales que gestionan múltiples clientes de forma centralizada con un dashboard multi-entidad.",
        "currency": "DOP",
        "price_monthly_cents": 799900,  # RD$ 7,999.00
        "price_usd": 127.99,
        "extra_entity_price_cents": 0,  # DEPRECATED
        "extra_billing_entity_price_cents": 0,  # DEPRECATED
        "entity_slot_price_cents": 60000,
        "user_slot_price_cents": 30000,
        "addon_ecf_block_size": 100,
        "addon_ecf_block_price_cents": 95000,
        "addon_ai_block_size": 500,
        "addon_ai_block_price_cents": 60000,
        "addon_storage_block_mb": 10240,
        "addon_storage_block_price_cents": 30000,
        "addon_ocr_block_size": 100,
        "addon_ocr_block_price_cents": 50000,  # RD$ 500 / 100 docs
        "max_users": 999999,
        "max_entities": 20,
        "max_ecf_monthly": 0,  # e-CF comes from purchased blocks
        "max_ai_queries_monthly": 10000,
        "max_ocr_docs_monthly": 1000,
        "max_storage_mb": 25600,
        "max_api_calls_monthly": 25000,
        "max_ai_rate_per_minute": 60,
        "max_api_rate_per_minute": 100,
        "max_ocr_rate_per_minute": 20,
        "has_advanced_reports": True,
        "has_api_access": True,
        "has_webhooks": True,
        "has_sla": True,
        "has_ai_sidebar": True,
        "has_multi_entity_dashboard": True,
        "has_cross_company_history": True,
        "has_batch_ecf_generation": True,
        "soft_limit_enabled": True,
        "overage_unit_price_cents": 1200,  # RD$ 12.00 / doc pay-as-you-go
        "sort_order": 30,
        "is_public": True,
        "is_enterprise": False,
    },
    {
        "name": "enterprise",
        "display_name": "Enterprise",
        "description": "Para grandes empresas que necesitan una solución completa, personalizada y con soporte dedicado.",
        "currency": "DOP",
        "price_monthly_cents": 0,  # Custom pricing — contact sales
        "extra_entity_price_cents": 0,  # DEPRECATED
        "extra_billing_entity_price_cents": 0,  # DEPRECATED
        "entity_slot_price_cents": 60000,
        "user_slot_price_cents": 30000,
        "addon_ecf_block_size": 100,
        "addon_ecf_block_price_cents": 95000,
        "addon_ai_block_size": 500,
        "addon_ai_block_price_cents": 60000,
        "addon_storage_block_mb": 10240,
        "addon_storage_block_price_cents": 30000,
        "addon_ocr_block_size": 100,
        "addon_ocr_block_price_cents": 50000,  # RD$ 500 / 100 docs
        "max_users": 999999,
        "max_entities": 999999,
        "max_ecf_monthly": 0,
        "max_ai_queries_monthly": 100000,
        "max_ocr_docs_monthly": 100000,
        "max_storage_mb": 999999,
        "max_api_calls_monthly": 999999,
        "max_ai_rate_per_minute": 999,
        "max_api_rate_per_minute": 999,
        "max_ocr_rate_per_minute": 999,
        "has_advanced_reports": True,
        "has_api_access": True,
        "has_webhooks": True,
        "has_sla": True,
        "has_ai_sidebar": True,
        "has_multi_entity_dashboard": True,
        "has_cross_company_history": True,
        "has_batch_ecf_generation": True,
        "soft_limit_enabled": False,
        "overage_unit_price_cents": 0,
        "sort_order": 40,
        "is_public": True,
        "is_enterprise": True,
    },
]


def seed_plans(db: Session = None):
    """Insert plans if they don't exist, or update them.

    Args:
        db: Optional SQLAlchemy session. If not provided, creates its own.
    """
    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        created = 0
        updated = 0
        for data in PLANS:
            plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == data["name"]).first()

            if plan:
                for k, v in data.items():
                    setattr(plan, k, v)
                updated += 1
            else:
                plan = SubscriptionPlan(**data)
                db.add(plan)
                created += 1

        db.commit()
        logger.info("✅ Seeded/Updated plans (created: %d, updated: %d)", created, updated)

        # Verify
        for p in db.query(SubscriptionPlan).order_by(SubscriptionPlan.sort_order).all():
            logger.info(
                "  • %s — %s %.2f/mo | USD=%.2f | users=%s entities=%s user_slot_price=%s entity_slot_price=%s",
                p.display_name, p.currency, p.price_monthly_cents / 100,
                float(p.price_usd) if p.price_usd is not None else 0.0,
                p.max_users, p.max_entities,
                p.user_slot_price_cents, p.entity_slot_price_cents,
            )

    finally:
        if own_session:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    seed_plans()
