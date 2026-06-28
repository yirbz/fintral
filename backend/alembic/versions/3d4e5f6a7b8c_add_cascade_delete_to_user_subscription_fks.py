"""add_cascade_delete_to_user_subscription_fks

Revision ID: 3d4e5f6a7b8c
Revises: 97310524ae35
Create Date: 2026-06-27 01:15:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = '3d4e5f6a7b8c'
down_revision: Union[str, Sequence[str], None] = '97310524ae35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_fkey")
    op.execute("""
        ALTER TABLE user_subscriptions
        ADD CONSTRAINT user_subscriptions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    """)
    op.execute("ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_plan_id_fkey")
    op.execute("""
        ALTER TABLE user_subscriptions
        ADD CONSTRAINT user_subscriptions_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_fkey")
    op.execute("""
        ALTER TABLE user_subscriptions
        ADD CONSTRAINT user_subscriptions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id)
    """)
    op.execute("ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_plan_id_fkey")
    op.execute("""
        ALTER TABLE user_subscriptions
        ADD CONSTRAINT user_subscriptions_plan_id_fkey
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
    """)
