import pytest
from src.etl.csv_loader import load_courts_to_staging, merge_courts_to_dwh
from src.database.models import StagingTennisCourt, DwhTennisCourt
from sqlalchemy import text

def test_load_courts_to_staging(db_session, sample_courts_data):
    """Test loading courts data to staging table."""
    # Run the ETL process
    load_courts_to_staging(sample_courts_data, db_session)
    
    # Query staging table
    staging_courts = db_session.query(StagingTennisCourt).all()
    
    # Verify number of records
    assert len(staging_courts) == 2
    
    # Verify data for first court
    court1 = db_session.query(StagingTennisCourt).filter_by(court_id='1').first()
    assert court1.park_name == 'Test Park 1'
    assert court1.court_type == 'Hard'
    assert float(court1.lat) == 40.7128
    assert float(court1.lon) == -74.0060
    
    # Verify data for second court
    court2 = db_session.query(StagingTennisCourt).filter_by(court_id='2').first()
    assert court2.park_name == 'Test Park 2'
    assert court2.court_type == 'Clay'
    assert float(court2.lat) == 40.7589
    assert float(court2.lon) == -73.9851

def test_merge_courts_to_dwh(db_session, sample_courts_data):
    """Test merging courts data from staging to DWH."""
    # First load data to staging
    load_courts_to_staging(sample_courts_data, db_session)
    
    # Run the merge process
    merge_courts_to_dwh(db_session)
    
    # Query DWH table
    dwh_courts = db_session.query(DwhTennisCourt).all()
    
    # Verify number of records
    assert len(dwh_courts) == 2
    
    # Verify data for first court
    court1 = db_session.query(DwhTennisCourt).filter_by(court_id='1').first()
    assert court1.park_name == 'Test Park 1'
    assert court1.court_type == 'Hard'
    assert float(court1.lat) == 40.7128
    assert float(court1.lon) == -74.0060
    assert court1.created_at is not None
    
    # Verify data for second court
    court2 = db_session.query(DwhTennisCourt).filter_by(court_id='2').first()
    assert court2.park_name == 'Test Park 2'
    assert court2.court_type == 'Clay'
    assert float(court2.lat) == 40.7589
    assert float(court2.lon) == -73.9851
    assert court2.created_at is not None

def test_merge_courts_updates_existing(db_session, sample_courts_data):
    """Test that merging updates existing records in DWH."""
    # First load and merge initial data
    load_courts_to_staging(sample_courts_data, db_session)
    merge_courts_to_dwh(db_session)
    
    # Modify data in staging
    modified_data = sample_courts_data.copy()
    modified_data.loc[0, 'park_name'] = 'Updated Park 1'
    modified_data.loc[0, 'court_type'] = 'Clay'
    
    # Load modified data and merge again
    load_courts_to_staging(modified_data, db_session)
    merge_courts_to_dwh(db_session)
    
    # Verify updates in DWH
    court1 = db_session.query(DwhTennisCourt).filter_by(court_id='1').first()
    assert court1.park_name == 'Updated Park 1'
    assert court1.court_type == 'Clay'
    
    # Verify other record remains unchanged
    court2 = db_session.query(DwhTennisCourt).filter_by(court_id='2').first()
    assert court2.park_name == 'Test Park 2'

def test_load_courts_handles_nulls(db_session, sample_courts_data):
    """Test that loading courts handles NULL values correctly."""
    # Create sample data with nulls
    data_with_nulls = sample_courts_data.copy()
    data_with_nulls.loc[0, ['phone', 'email', 'website']] = None
    
    # Load data
    load_courts_to_staging(data_with_nulls, db_session)
    
    # Verify nulls are handled correctly
    court = db_session.query(StagingTennisCourt).filter_by(court_id='1').first()
    assert court.phone is None
    assert court.email is None
    assert court.website is None
    assert court.park_name == 'Test Park 1'  # Non-null field should be preserved 