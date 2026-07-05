"""new-model: e_cf_balance, entity_slot_price, addon_entity_slots

Revision ID: 639473f7d133
Revises: a7b8c9d0e1f3
Create Date: 2026-06-15 21:06:46.330153

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '639473f7d133'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE organization_subscriptions ADD COLUMN IF NOT EXISTS addon_entity_slots INTEGER")
    op.execute("ALTER TABLE organization_subscriptions ALTER COLUMN addon_billing_entities DROP NOT NULL")
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS e_cf_balance INTEGER")
    op.execute("UPDATE organizations SET e_cf_balance = 0 WHERE e_cf_balance IS NULL")
    op.execute("ALTER TABLE organizations ALTER COLUMN e_cf_balance SET NOT NULL")
    op.execute("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS entity_slot_price_cents INTEGER")
    op.execute("UPDATE subscription_plans SET entity_slot_price_cents = 60000 WHERE entity_slot_price_cents IS NULL")


def downgrade() -> None:
    op.drop_column('subscription_plans', 'entity_slot_price_cents')
    op.drop_column('organizations', 'e_cf_balance')
    op.alter_column('organization_subscriptions', 'addon_billing_entities',
               existing_type=sa.INTEGER(),
               nullable=False)
    op.drop_column('organization_subscriptions', 'addon_entity_slots')
