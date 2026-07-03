"""add_user_subscriptions

Revision ID: 97310524ae35
Revises: 1ba6aefd32a7
Create Date: 2026-06-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.database import GUID


revision: str = '97310524ae35'
down_revision: Union[str, Sequence[str], None] = '1ba6aefd32a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('user_subscriptions',
        sa.Column('id', GUID(), nullable=False),
        sa.Column('user_id', GUID(), nullable=False, index=True),
        sa.Column('plan_id', GUID(), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='trialing'),
        sa.Column('trial_ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('lago_subscription_id', sa.String(length=64), nullable=True, index=True),
        sa.Column('lago_customer_id', sa.String(length=64), nullable=True, index=True),
        sa.Column('lago_plan_code', sa.String(length=100), nullable=True),
        sa.Column('payment_method', sa.String(length=50), nullable=True),
        sa.Column('billing_cycle_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('billing_cycle_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('canceled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['plan_id'], ['subscription_plans.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        if_not_exists=True,
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_subscriptions_user_id ON user_subscriptions (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_subscriptions_lago_subscription_id ON user_subscriptions (lago_subscription_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_subscriptions_lago_customer_id ON user_subscriptions (lago_customer_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_user_subscriptions_lago_customer_id")
    op.execute("DROP INDEX IF EXISTS ix_user_subscriptions_lago_subscription_id")
    op.execute("DROP INDEX IF EXISTS ix_user_subscriptions_user_id")
    op.execute("DROP TABLE IF EXISTS user_subscriptions")
