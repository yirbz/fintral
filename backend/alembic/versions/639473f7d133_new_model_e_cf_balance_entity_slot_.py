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
    op.add_column('organization_subscriptions', sa.Column('addon_entity_slots', sa.Integer(), nullable=True))
    op.alter_column('organization_subscriptions', 'addon_billing_entities',
               existing_type=sa.INTEGER(),
               nullable=True)
    op.add_column('organizations', sa.Column('e_cf_balance', sa.Integer(), nullable=True))
    op.execute("UPDATE organizations SET e_cf_balance = 0 WHERE e_cf_balance IS NULL")
    op.alter_column('organizations', 'e_cf_balance',
               existing_type=sa.INTEGER(),
               nullable=False)
    op.add_column('subscription_plans', sa.Column('entity_slot_price_cents', sa.Integer(), nullable=True))
    op.execute("UPDATE subscription_plans SET entity_slot_price_cents = 60000 WHERE entity_slot_price_cents IS NULL")


def downgrade() -> None:
    op.drop_column('subscription_plans', 'entity_slot_price_cents')
    op.drop_column('organizations', 'e_cf_balance')
    op.alter_column('organization_subscriptions', 'addon_billing_entities',
               existing_type=sa.INTEGER(),
               nullable=False)
    op.drop_column('organization_subscriptions', 'addon_entity_slots')
