"""merge cert tracking and alanube fields

Revision ID: 9748c57246f4
Revises: 20c2ae81fe34, 35e1e54655e0
Create Date: 2026-05-28 09:12:38.115769

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9748c57246f4'
down_revision: Union[str, Sequence[str], None] = ('20c2ae81fe34', '35e1e54655e0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
