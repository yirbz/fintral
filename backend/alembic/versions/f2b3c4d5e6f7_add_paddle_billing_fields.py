"""add_paddle_billing_fields

Add Paddle Billing fields to OrganizationSubscription and SubscriptionPlan,
and create the paddle_webhook_events table.

Revision ID: f2b3c4d5e6f7
Revises: dc5fa79d59cd
Create Date: 2026-06-20

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "f2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "2c926896b066"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── OrganizationSubscription ─────────────────────────────────────
    op.add_column(
        "organization_subscriptions",
        sa.Column("paddle_subscription_id", sa.String(64), nullable=True, index=True),
    )
    op.add_column(
        "organization_subscriptions",
        sa.Column("paddle_customer_id", sa.String(64), nullable=True, index=True),
    )
    op.add_column(
        "organization_subscriptions",
        sa.Column("paddle_price_id", sa.String(64), nullable=True),
    )
    op.add_column(
        "organization_subscriptions",
        sa.Column("paddle_collection_mode", sa.String(16), nullable=True),
    )
    op.add_column(
        "organization_subscriptions",
        sa.Column("paddle_scheduled_change", postgresql.JSONB, nullable=True),
    )
    op.add_column(
        "organization_subscriptions",
        sa.Column("current_billing_period_start", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "organization_subscriptions",
        sa.Column("current_billing_period_end", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column(
        "organization_subscriptions",
        "plan_id",
        existing_type=sa.dialects.postgresql.UUID(),
        nullable=True,
    )
    op.alter_column(
        "organization_subscriptions",
        "organization_id",
        existing_type=sa.dialects.postgresql.UUID(),
        nullable=True,
    )
    op.alter_column(
        "organization_subscriptions",
        "billing_cycle_start",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )
    op.alter_column(
        "organization_subscriptions",
        "billing_cycle_end",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )

    # ── SubscriptionPlan ─────────────────────────────────────────────
    op.add_column(
        "subscription_plans",
        sa.Column("price_usd", sa.Numeric(10, 2), nullable=True),
    )
    op.add_column(
        "subscription_plans",
        sa.Column("paddle_product_id", sa.String(64), nullable=True),
    )
    op.add_column(
        "subscription_plans",
        sa.Column("paddle_price_id_monthly", sa.String(64), nullable=True),
    )
    op.add_column(
        "subscription_plans",
        sa.Column("paddle_price_id_annual", sa.String(64), nullable=True),
    )

    # ── PaddleWebhookEvent table ─────────────────────────────────────
    op.create_table(
        "paddle_webhook_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.String(128), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.Column("processed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    op.create_index(
        op.f("ix_paddle_webhook_events_event_id"),
        "paddle_webhook_events",
        ["event_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_paddle_webhook_events_event_type"),
        "paddle_webhook_events",
        ["event_type"],
        unique=False,
    )


def downgrade() -> None:
    # ── PaddleWebhookEvent table ─────────────────────────────────────
    op.drop_index(op.f("ix_paddle_webhook_events_event_type"), table_name="paddle_webhook_events")
    op.drop_index(op.f("ix_paddle_webhook_events_event_id"), table_name="paddle_webhook_events")
    op.drop_table("paddle_webhook_events")

    # ── SubscriptionPlan ─────────────────────────────────────────────
    op.drop_column("subscription_plans", "paddle_price_id_annual")
    op.drop_column("subscription_plans", "paddle_price_id_monthly")
    op.drop_column("subscription_plans", "paddle_product_id")
    op.drop_column("subscription_plans", "price_usd")

    # ── OrganizationSubscription ─────────────────────────────────────
    op.alter_column(
        "organization_subscriptions",
        "plan_id",
        existing_type=sa.dialects.postgresql.UUID(),
        nullable=False,
    )
    op.alter_column(
        "organization_subscriptions",
        "organization_id",
        existing_type=sa.dialects.postgresql.UUID(),
        nullable=False,
    )
    op.alter_column(
        "organization_subscriptions",
        "billing_cycle_start",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.alter_column(
        "organization_subscriptions",
        "billing_cycle_end",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.drop_column("organization_subscriptions", "current_billing_period_end")
    op.drop_column("organization_subscriptions", "current_billing_period_start")
    op.drop_column("organization_subscriptions", "paddle_scheduled_change")
    op.drop_column("organization_subscriptions", "paddle_collection_mode")
    op.drop_column("organization_subscriptions", "paddle_price_id")
    op.drop_column("organization_subscriptions", "paddle_customer_id")
    op.drop_column("organization_subscriptions", "paddle_subscription_id")
