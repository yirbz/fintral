"""add max_products to subscription_plans

Revision ID: 40fb9726689d
Revises: 40fb9726689c
Create Date: 2026-06-28 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '40fb9726689d'
down_revision: Union[str, Sequence[str], None] = '40fb9726689c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_products INTEGER NOT NULL DEFAULT 0")


def downgrade() -> None:
    op.drop_column('subscription_plans', 'max_products')
