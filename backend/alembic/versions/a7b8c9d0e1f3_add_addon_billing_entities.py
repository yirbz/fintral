"""add_addon_billing_entities

Revision ID: a7b8c9d0e1f3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-15 03:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7b8c9d0e1f3"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organization_subscriptions", sa.Column("addon_billing_entities", sa.Integer(), nullable=True))
    op.execute("UPDATE organization_subscriptions SET addon_billing_entities = 0 WHERE addon_billing_entities IS NULL")
    op.alter_column("organization_subscriptions", "addon_billing_entities", nullable=False)


def downgrade() -> None:
    op.drop_column("organization_subscriptions", "addon_billing_entities")
