"""update schema for validation

Revision ID: update_schema_for_validation
Revises: b5812fc8c196
Create Date: 2024-03-30 00:04:31.388748

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'update_schema_for_validation'
down_revision = 'b5812fc8c196'
branch_labels = None
depends_on = None

def upgrade():
    # Add filepath column as nullable first
    op.add_column('file_registry', sa.Column('filepath', sa.String(1000), nullable=True),
                  schema='raw_files')

    # Update existing records with filename as filepath
    op.execute("""
        UPDATE raw_files.file_registry 
        SET filepath = filename 
        WHERE filepath IS NULL
    """)

    # Now make the column not nullable
    op.alter_column('file_registry', 'filepath',
                    existing_type=sa.String(1000),
                    nullable=False,
                    schema='raw_files')

    # Convert date columns from string to date type
    op.execute('ALTER TABLE dwh.court_availability ALTER COLUMN date TYPE date USING date::date')
    op.execute('ALTER TABLE staging.court_availability ALTER COLUMN date TYPE date USING date::date')

    # Add constraints for lat/lon
    op.create_check_constraint(
        'check_lat',
        'tennis_courts',
        sa.Column('lat', sa.DECIMAL(10, 8)) >= -90.0,
        schema='dwh'
    )
    op.create_check_constraint(
        'check_lat_max',
        'tennis_courts',
        sa.Column('lat', sa.DECIMAL(10, 8)) <= 90.0,
        schema='dwh'
    )
    op.create_check_constraint(
        'check_lon',
        'tennis_courts',
        sa.Column('lon', sa.DECIMAL(11, 8)) >= -180.0,
        schema='dwh'
    )
    op.create_check_constraint(
        'check_lon_max',
        'tennis_courts',
        sa.Column('lon', sa.DECIMAL(11, 8)) <= 180.0,
        schema='dwh'
    )

    # Add check constraint for court type
    op.create_check_constraint(
        'check_court_type',
        'tennis_courts',
        sa.Column('court_type').in_(['Hard', 'Clay']),
        schema='dwh'
    )

    # Add similar constraints to staging tables
    op.create_check_constraint(
        'check_lat',
        'tennis_courts',
        sa.Column('lat', sa.DECIMAL(10, 8)) >= -90.0,
        schema='staging'
    )
    op.create_check_constraint(
        'check_lat_max',
        'tennis_courts',
        sa.Column('lat', sa.DECIMAL(10, 8)) <= 90.0,
        schema='staging'
    )
    op.create_check_constraint(
        'check_lon',
        'tennis_courts',
        sa.Column('lon', sa.DECIMAL(11, 8)) >= -180.0,
        schema='staging'
    )
    op.create_check_constraint(
        'check_lon_max',
        'tennis_courts',
        sa.Column('lon', sa.DECIMAL(11, 8)) <= 180.0,
        schema='staging'
    )
    op.create_check_constraint(
        'check_court_type',
        'tennis_courts',
        sa.Column('court_type').in_(['Hard', 'Clay']),
        schema='staging'
    )

def downgrade():
    # Remove constraints
    op.drop_constraint('check_lat', 'tennis_courts', schema='dwh')
    op.drop_constraint('check_lat_max', 'tennis_courts', schema='dwh')
    op.drop_constraint('check_lon', 'tennis_courts', schema='dwh')
    op.drop_constraint('check_lon_max', 'tennis_courts', schema='dwh')
    op.drop_constraint('check_court_type', 'tennis_courts', schema='dwh')

    op.drop_constraint('check_lat', 'tennis_courts', schema='staging')
    op.drop_constraint('check_lat_max', 'tennis_courts', schema='staging')
    op.drop_constraint('check_lon', 'tennis_courts', schema='staging')
    op.drop_constraint('check_lon_max', 'tennis_courts', schema='staging')
    op.drop_constraint('check_court_type', 'tennis_courts', schema='staging')

    # Convert date columns back to string
    op.execute('ALTER TABLE dwh.court_availability ALTER COLUMN date TYPE varchar(50) USING date::varchar')
    op.execute('ALTER TABLE staging.court_availability ALTER COLUMN date TYPE varchar(50) USING date::varchar')

    # Remove filepath column from file_registry
    op.drop_column('file_registry', 'filepath', schema='raw_files') 