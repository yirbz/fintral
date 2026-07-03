"""add_ocr_blocks_addon

Revision ID: 47140db6a013
Revises: 366e6c78f69b
Create Date: 2026-07-01 16:42:28.547605

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '47140db6a013'
down_revision: Union[str, Sequence[str], None] = '366e6c78f69b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('organization_subscriptions', sa.Column('addon_ocr_blocks', sa.Integer(), nullable=True))
    op.add_column('organization_subscriptions', sa.Column('pending_cancel_ocr_blocks', sa.Integer(), nullable=False, server_default=sa.text('0')))
    op.add_column('subscription_plans', sa.Column('addon_ocr_block_size', sa.Integer(), nullable=True))
    op.add_column('subscription_plans', sa.Column('addon_ocr_block_price_cents', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('subscription_plans', 'addon_ocr_block_price_cents')
    op.drop_column('subscription_plans', 'addon_ocr_block_size')
    op.drop_column('organization_subscriptions', 'pending_cancel_ocr_blocks')
    op.drop_column('organization_subscriptions', 'addon_ocr_blocks')
