"""SubscriptionPlan — defines available tier plans for Fintral."""

from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String, Text
from uuid_utils import uuid7

from app.database import Base, GUID
from app.utils.dates import utc_now


class SubscriptionPlan(Base):
    """A pricing plan tier with defined limits for all resources."""
    __tablename__ = "subscription_plans"

    id = Column(GUID, primary_key=True, default=uuid7)
    name = Column(String(64), unique=True, nullable=False, index=True)  # slug: inicial, profesional, despacho
    display_name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)

    # ── Pricing ──────────────────────────────────────────────────────
    price_monthly_cents = Column(Integer, nullable=False)       # 2900 = $29.00
    currency = Column(String(3), default="USD")
    price_usd = Column(Numeric(10, 2), nullable=True)           # USD price for reference
    price_dop = Column(Numeric(10, 2), nullable=True)           # DOP price for MIO/Lago checkout
    lago_plan_code = Column(String(100), nullable=True)         # Lago plan identifier

    extra_entity_price_cents = Column(Integer, default=0)       # DEPRECATED — always 0
    extra_billing_entity_price_cents = Column(Integer, default=0)  # DEPRECATED — always 0
    entity_slot_price_cents = Column(Integer, default=0)        # RD$600 / extra entity slot beyond plan limit
    user_slot_price_cents = Column(Integer, default=0)          # RD$300 / extra user slot beyond plan limit
    addon_ecf_block_size = Column(Integer, default=100)         # docs per add-on block
    addon_ecf_block_price_cents = Column(Integer, default=500)  # $5.00
    addon_ai_block_size = Column(Integer, default=500)          # queries per add-on block
    addon_ai_block_price_cents = Column(Integer, default=1000)  # $10.00
    addon_storage_block_mb = Column(Integer, default=10240)     # 10GB
    addon_storage_block_price_cents = Column(Integer, default=500)
    addon_ocr_block_size = Column(Integer, default=100)          # docs per add-on block
    addon_ocr_block_price_cents = Column(Integer, default=50000)  # RD$ 500

    # ── Resource limits ──────────────────────────────────────────────
    max_users = Column(Integer, nullable=False, default=1)
    max_entities = Column(Integer, nullable=False, default=1)
    max_products = Column(Integer, nullable=False, default=0)  # 0 = unlimited

    # Monthly hard caps
    max_ecf_monthly = Column(Integer, nullable=False, default=0)
    max_ai_queries_monthly = Column(Integer, nullable=False, default=0)
    max_ocr_docs_monthly = Column(Integer, nullable=False, default=0)
    max_storage_mb = Column(Integer, nullable=False, default=0)
    max_api_calls_monthly = Column(Integer, nullable=True)  # null = no API

    # Rate limits (per-minute windows)
    max_ai_rate_per_minute = Column(Integer, nullable=False, default=10)
    max_api_rate_per_minute = Column(Integer, nullable=False, default=0)
    max_ocr_rate_per_minute = Column(Integer, nullable=False, default=5)

    # ── Feature flags ────────────────────────────────────────────────
    has_advanced_reports = Column(Boolean, default=False)
    has_api_access = Column(Boolean, default=False)
    has_webhooks = Column(Boolean, default=False)
    has_sla = Column(Boolean, default=False)
    has_ai_sidebar = Column(Boolean, default=True)
    has_multi_entity_dashboard = Column(Boolean, default=False)
    has_cross_company_history = Column(Boolean, default=False)
    has_batch_ecf_generation = Column(Boolean, default=False)

    # ── Soft limit policy ────────────────────────────────────────────
    soft_limit_enabled = Column(Boolean, default=True)   # notify + auto-addon vs. hard block
    overage_unit_price_cents = Column(Integer, default=0)  # per-doc overage price (0 = block-only)

    # ── Metadata ─────────────────────────────────────────────────────
    sort_order = Column(Integer, default=0)
    is_public = Column(Boolean, default=True)        # visible on pricing page
    is_active = Column(Boolean, default=True)         # can be subscribed
    is_enterprise = Column(Boolean, default=False)    # requires contact

    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    def to_dict(self) -> dict:
        usd_val = None
        if self.price_usd is not None:
            usd_val = float(self.price_usd)
        else:
            fallbacks = {
                "inicial": 16.49,
                "profesional": 47.99,
                "despacho": 127.99,
            }
            usd_val = fallbacks.get(self.name.lower())

        return {
            "id": str(self.id),
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description,
            "price_monthly": round(self.price_monthly_cents / 100, 2),
            "price_monthly_cents": self.price_monthly_cents,
            "price_usd": usd_val,
            "price_dop": float(self.price_dop) if self.price_dop is not None else None,
            "lago_plan_code": self.lago_plan_code,
            "currency": self.currency,
            "extra_entity_price": 0,  # DEPRECATED — always 0
            "extra_billing_entity_price": 0,  # DEPRECATED — always 0
            "entity_slot_price": round(self.entity_slot_price_cents / 100, 2),
            "user_slot_price_cents": self.user_slot_price_cents,
            "user_slot_price": round(self.user_slot_price_cents / 100, 2),
            "addon_ecf_block_size": self.addon_ecf_block_size,
            "addon_ecf_block_price": round(self.addon_ecf_block_price_cents / 100, 2),
            "addon_ai_block_size": self.addon_ai_block_size,
            "addon_ai_block_price": round(self.addon_ai_block_price_cents / 100, 2),
            "addon_ocr_block_size": self.addon_ocr_block_size,
            "addon_ocr_block_price": round(self.addon_ocr_block_price_cents / 100, 2),
            "limits": {
                "max_users": self.max_users,
                "max_entities": self.max_entities,
                "max_products": self.max_products,
                "max_ecf_monthly": self.max_ecf_monthly,
                "max_ai_queries_monthly": self.max_ai_queries_monthly,
                "max_ocr_docs_monthly": self.max_ocr_docs_monthly,
                "max_storage_mb": self.max_storage_mb,
                "max_api_calls_monthly": self.max_api_calls_monthly,
                "max_ai_rate_per_minute": self.max_ai_rate_per_minute,
                "max_api_rate_per_minute": self.max_api_rate_per_minute,
                "max_ocr_rate_per_minute": self.max_ocr_rate_per_minute,
            },
            "features": {
                "advanced_reports": self.has_advanced_reports,
                "api_access": self.has_api_access,
                "webhooks": self.has_webhooks,
                "sla": self.has_sla,
                "ai_sidebar": self.has_ai_sidebar,
                "multi_entity_dashboard": self.has_multi_entity_dashboard,
                "cross_company_history": self.has_cross_company_history,
                "batch_ecf_generation": self.has_batch_ecf_generation,
            },
            "soft_limit_enabled": self.soft_limit_enabled,
            "is_enterprise": self.is_enterprise,
            "sort_order": self.sort_order,
        }
