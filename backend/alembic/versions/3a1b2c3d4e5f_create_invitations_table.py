"""create_invitations_table

Revision ID: 3a1b2c3d4e5f
Revises: 2d8273d3ae1d
Create Date: 2026-05-23 01:29:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
import app


revision: str = "3a1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "2d8273d3ae1d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if inspect(bind).has_table("invitations"):
        return
    op.create_table(
        "invitations",
        sa.Column("id", app.database.GUID(length=32), nullable=False),
        sa.Column("organization_id", app.database.GUID(length=32), nullable=False),
        sa.Column("invited_by_user_id", app.database.GUID(length=32), nullable=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="member"),
        sa.Column("permissions", sa.Text(), nullable=True),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("accepted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["invited_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index(op.f("ix_invitations_email"), "invitations", ["email"], unique=False)
    op.create_index(op.f("ix_invitations_organization_id"), "invitations", ["organization_id"], unique=False)
    op.create_index(op.f("ix_invitations_token"), "invitations", ["token"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_invitations_token"), table_name="invitations")
    op.drop_index(op.f("ix_invitations_organization_id"), table_name="invitations")
    op.drop_index(op.f("ix_invitations_email"), table_name="invitations")
    op.drop_table("invitations")
