"""add_exchange_rate_to_payment_proofs

Revision ID: 9e884bd4ddb3
Revises: 9e884bd4ddb2
Create Date: 2026-06-22 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9e884bd4ddb3'
down_revision: Union[str, Sequence[str], None] = '9e884bd4ddb2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('payment_proofs', sa.Column('exchange_rate', sa.Numeric(precision=12, scale=4), nullable=True))
    op.add_column('payment_proofs', sa.Column('usd_amount', sa.Numeric(precision=12, scale=2), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('payment_proofs', 'usd_amount')
    op.drop_column('payment_proofs', 'exchange_rate')
