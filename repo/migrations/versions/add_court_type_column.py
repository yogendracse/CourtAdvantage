"""add court type column

Revision ID: b5812fc8c196
Revises: a5812fc8c196
Create Date: 2024-01-31 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b5812fc8c196'
down_revision = 'a5812fc8c196'
branch_labels = None
depends_on = None


def upgrade():
    # Add court_type column to tennis_courts table
    op.add_column('tennis_courts', sa.Column('court_type', sa.String(50)), schema='dwh')
    op.add_column('tennis_courts', sa.Column('court_type', sa.String(50)), schema='staging')


def downgrade():
    # Drop court_type column from tennis_courts table
    op.drop_column('tennis_courts', 'court_type', schema='dwh')
    op.drop_column('tennis_courts', 'court_type', schema='staging') 