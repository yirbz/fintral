"""add_addon_entity_slots_to_user_subscription

Revision ID: 90e1f2a3b4c6
Revises: 90e1f2a3b4c5
Create Date: 2026-06-29 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "90e1f2a3b4c6"
down_revision: Union[str, Sequence[str], None] = "90e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_subscriptions",
        sa.Column("addon_entity_slots", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("user_subscriptions", "addon_entity_slots")
