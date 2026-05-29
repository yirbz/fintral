"""merge_settings_overhaul_with_develop

Revision ID: d24fe2e1132d
Revises: 89a253842393, 332a4a5132ab
Create Date: 2026-05-24 19:01:08.207067

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd24fe2e1132d'
down_revision: Union[str, Sequence[str], None] = ('89a253842393', '332a4a5132ab')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
