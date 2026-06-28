"""add_recurring_billing_models

Revision ID: 80dfa2c3e0dd
Revises: 797fa8328aa8
Create Date: 2026-06-28 00:21:46.384871

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


import app.database


# revision identifiers, used by Alembic.
revision: str = '80dfa2c3e0dd'
down_revision: Union[str, Sequence[str], None] = '797fa8328aa8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create user_card_tokens table
    op.create_table(
        'user_card_tokens',
        sa.Column('id', app.database.GUID(length=32), nullable=False),
        sa.Column('user_id', app.database.GUID(length=32), nullable=False),
        sa.Column('gateway', sa.String(length=50), nullable=False, server_default='mio'),
        sa.Column('card_token', sa.String(length=255), nullable=False),
        sa.Column('card_brand', sa.String(length=50), nullable=True),
        sa.Column('last_four', sa.String(length=10), nullable=True),
        sa.Column('expiry_month', sa.Integer(), nullable=True),
        sa.Column('expiry_year', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_card_tokens_card_token'), 'user_card_tokens', ['card_token'], unique=True)
    op.create_index(op.f('ix_user_card_tokens_user_id'), 'user_card_tokens', ['user_id'], unique=False)

    # Create refund_requests table
    op.create_table(
        'refund_requests',
        sa.Column('id', app.database.GUID(length=32), nullable=False),
        sa.Column('user_id', app.database.GUID(length=32), nullable=False),
        sa.Column('payment_order_id', sa.Integer(), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(length=255), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['payment_order_id'], ['mio_payment_orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_refund_requests_payment_order_id'), 'refund_requests', ['payment_order_id'], unique=False)
    op.create_index(op.f('ix_refund_requests_user_id'), 'refund_requests', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_refund_requests_user_id'), table_name='refund_requests')
    op.drop_index(op.f('ix_refund_requests_payment_order_id'), table_name='refund_requests')
    op.drop_table('refund_requests')
    op.drop_index(op.f('ix_user_card_tokens_user_id'), table_name='user_card_tokens')
    op.drop_index(op.f('ix_user_card_tokens_card_token'), table_name='user_card_tokens')
    op.drop_table('user_card_tokens')
