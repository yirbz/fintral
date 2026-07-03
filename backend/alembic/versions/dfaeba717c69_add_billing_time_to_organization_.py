"""add_billing_time_to_organization_subscriptions

Revision ID: dfaeba717c69
Revises: 40fb9726689f
Create Date: 2026-06-29 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "dfaeba717c69"
down_revision: Union[str, Sequence[str], None] = "40fb9726689f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organization_subscriptions",
        sa.Column("billing_time", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organization_subscriptions", "billing_time")
