"""Add replay_log and world_config_hash to races

Revision ID: a5f2e8c91d3b
Revises: 2fda4ccbd6a1
Create Date: 2026-03-06 11:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a5f2e8c91d3b'
down_revision: Union[str, None] = '2fda4ccbd6a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('races', sa.Column('world_config_hash', sa.String(), nullable=True))
    op.add_column('races', sa.Column('replay_log', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('races', 'replay_log')
    op.drop_column('races', 'world_config_hash')
