"""Update schema for park_id and court_id structure

Revision ID: update_schema_park_court
Revises: add_is_available_column
Create Date: 2025-08-11 14:08:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'update_schema_park_court'
down_revision = 'add_is_available_column'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update tennis_courts table - rename court_id to park_id
    op.alter_column('tennis_courts', 'court_id', new_column_name='park_id', schema='dwh')
    op.alter_column('tennis_courts', 'court_id', new_column_name='park_id', schema='staging')
    
    # Update court_availability table - add park_id and rename court to court_id
    op.add_column('court_availability', sa.Column('park_id', sa.String(50), nullable=True), schema='dwh')
    op.add_column('court_availability', sa.Column('park_id', sa.String(50), nullable=True), schema='staging')
    
    # Copy data from existing court_id to park_id temporarily
    op.execute("UPDATE dwh.court_availability SET park_id = court_id")
    op.execute("UPDATE staging.court_availability SET park_id = court_id")
    
    # Copy data from court column to a new court_id column (we'll rename the existing one)
    op.execute("UPDATE dwh.court_availability SET court_id = court")
    op.execute("UPDATE staging.court_availability SET court_id = court")
    
    # Make park_id not nullable
    op.alter_column('court_availability', 'park_id', nullable=False, schema='dwh')
    op.alter_column('court_availability', 'park_id', nullable=False, schema='staging')
    
    # Drop the old court column
    op.drop_column('court_availability', 'court', schema='dwh')
    op.drop_column('court_availability', 'court_id', schema='staging')
    
    # Create new unique constraint
    op.create_unique_constraint('uix_court_availability', 'court_availability', ['park_id', 'court_id', 'date', 'time'], schema='dwh')
    
    # Add foreign key constraint for park_id
    op.create_foreign_key('fk_court_availability_park_id', 'court_availability', 'tennis_courts', ['park_id'], ['park_id'], source_schema='dwh', referent_schema='dwh')
    op.create_foreign_key('fk_court_availability_park_id', 'court_availability', 'tennis_courts', ['park_id'], ['park_id'], source_schema='staging', referent_schema='dwh')


def downgrade() -> None:
    # Revert all changes
    op.drop_constraint('fk_court_availability_park_id', 'court_availability', schema='staging')
    op.drop_constraint('fk_court_availability_park_id', 'court_availability', schema='dwh')
    
    op.drop_constraint('uix_court_availability', 'court_availability', schema='dwh')
    op.create_unique_constraint('uix_court_availability', 'court_availability', ['court_id', 'date', 'time', 'court'], schema='dwh')
    
    # Add back court column
    op.add_column('court_availability', sa.Column('court', sa.String(50), nullable=True), schema='dwh')
    op.add_column('court_availability', sa.Column('court', sa.String(50), nullable=True), schema='staging')
    
    # Copy data back
    op.execute("UPDATE dwh.court_availability SET court = court_id")
    op.execute("UPDATE staging.court_availability SET court = court_id")
    
    # Drop court_id and park_id columns
    op.drop_column('court_availability', 'court_id', schema='dwh')
    op.drop_column('court_availability', 'court_id', schema='staging')
    op.drop_column('court_availability', 'park_id', schema='dwh')
    op.drop_column('court_availability', 'park_id', schema='staging')
    
    # Add back court_id column
    op.add_column('court_availability', sa.Column('court_id', sa.String(50), nullable=True), schema='dwh')
    op.add_column('court_availability', sa.Column('court_id', sa.String(50), nullable=True), schema='staging')
    
    # Copy data back
    op.execute("UPDATE dwh.court_availability SET court_id = park_id")
    op.execute("UPDATE staging.court_availability SET court_id = park_id")
    
    # Make court_id not nullable
    op.alter_column('court_availability', 'court_id', nullable=False, schema='dwh')
    op.alter_column('court_availability', 'court_id', nullable=False, schema='staging')
    
    # Revert tennis_courts table
    op.alter_column('tennis_courts', 'park_id', new_column_name='court_id', schema='dwh')
    op.alter_column('tennis_courts', 'park_id', new_column_name='court_id', schema='staging')
