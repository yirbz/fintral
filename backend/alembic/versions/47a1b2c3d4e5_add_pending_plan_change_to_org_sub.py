"""add_pending_plan_change_id_to_organization_subscriptions

Revision ID: 47a1b2c3d4e5
Revises: 47140db6a013
Create Date: 2026-07-02 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "47a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "47140db6a013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organization_subscriptions", sa.Column("pending_plan_change_id", postgresql.UUID(), sa.ForeignKey("subscription_plans.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("organization_subscriptions", "pending_plan_change_id")
