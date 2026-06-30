"""drop_user_card_tokens

Revision ID: 90e1f2a3b4c5
Revises: 80dfa2c3e0dd
Create Date: 2026-06-29 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "90e1f2a3b4c5"
down_revision: Union[str, Sequence[str], None] = "80dfa2c3e0dd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(op.f("ix_user_card_tokens_user_id"), table_name="user_card_tokens")
    op.drop_index(op.f("ix_user_card_tokens_card_token"), table_name="user_card_tokens")
    op.drop_table("user_card_tokens")


def downgrade() -> None:
    op.create_table(
        "user_card_tokens",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=False),
        sa.Column("gateway", sa.String(length=50), nullable=False),
        sa.Column("card_token", sa.String(length=255), nullable=False),
        sa.Column("card_brand", sa.String(length=50), nullable=True),
        sa.Column("last_four", sa.String(length=10), nullable=True),
        sa.Column("expiry_month", sa.Integer(), nullable=True),
        sa.Column("expiry_year", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_user_card_tokens_card_token"), "user_card_tokens", ["card_token"], unique=True
    )
    op.create_index(
        op.f("ix_user_card_tokens_user_id"), "user_card_tokens", ["user_id"], unique=False
    )
