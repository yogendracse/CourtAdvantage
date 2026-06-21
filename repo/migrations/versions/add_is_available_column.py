"""add is_available column

Revision ID: add_is_available_column
Revises: update_schema_for_validation
Create Date: 2024-08-11 13:50:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_is_available_column'
down_revision = 'update_schema_for_validation'
branch_labels = None
depends_on = None

def upgrade():
    # Add is_available column to staging table
    op.add_column('court_availability', sa.Column('is_available', sa.Boolean(), nullable=True), schema='staging')
    op.execute("""
        UPDATE staging.court_availability
        SET is_available = (status = 'Reserve this time')
        WHERE status IS NOT NULL
    """)
    op.alter_column('court_availability', 'is_available', nullable=False, schema='staging')

    # Add is_available column to dwh table
    op.add_column('court_availability', sa.Column('is_available', sa.Boolean(), nullable=True), schema='dwh')
    op.execute("""
        UPDATE dwh.court_availability
        SET is_available = (status = 'Reserve this time')
        WHERE status IS NOT NULL
    """)
    op.alter_column('court_availability', 'is_available', nullable=False, schema='dwh')

def downgrade():
    # Remove is_available column from staging table
    op.drop_column('court_availability', 'is_available', schema='staging')

    # Remove is_available column from dwh table
    op.drop_column('court_availability', 'is_available', schema='dwh')
