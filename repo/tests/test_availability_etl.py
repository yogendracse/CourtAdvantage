import pytest
from src.etl.csv_loader import (
    load_availability_to_staging, merge_availability_to_dwh,
    register_file, update_file_status
)
from src.database.models import (
    StagingCourtAvailability, DwhCourtAvailability,
    FileRegistry, DwhTennisCourt
)
from datetime import datetime
import tempfile
import os
from sqlalchemy import text

def setup_courts(db_session, sample_courts_data):
    """Helper function to set up required court records in DWH."""
    for _, court in sample_courts_data.iterrows():
        court_obj = DwhTennisCourt(
            court_id=str(court['court_id']),  # Ensure court_id is string
            park_name=court['park_name'],
            court_type=court['court_type']
        )
        db_session.add(court_obj)
    db_session.commit()

def test_register_file(db_session, sample_csv_files):
    """Test registering a file in the registry."""
    file_id = register_file(sample_csv_files['availability'], session=db_session)
    
    # Verify file was registered
    file_record = db_session.get(FileRegistry, file_id)
    assert file_record is not None
    assert file_record.filename == os.path.basename(sample_csv_files['availability'])
    assert file_record.status == 'pending'
    assert file_record.load_timestamp is not None

def test_update_file_status(db_session, sample_csv_files):
    """Test updating file status in the registry."""
    # First register a file
    file_id = register_file(sample_csv_files['availability'], session=db_session)
    
    # Update its status
    update_file_status(file_id, 'processed', db_session)
    
    # Verify status was updated
    file_record = db_session.get(FileRegistry, file_id)
    assert file_record.status == 'processed'

def test_load_availability_to_staging(db_session, sample_courts_data, sample_csv_files):
    """Test loading availability data to staging table."""
    # Set up required court records
    setup_courts(db_session, sample_courts_data)
    
    # Register file and load data
    file_id = register_file(sample_csv_files['availability'], session=db_session)
    load_availability_to_staging(sample_csv_files['availability'], file_id, db_session)
    
    # Query staging table
    staging_slots = db_session.query(StagingCourtAvailability).all()
    
    # Verify number of records
    assert len(staging_slots) == 3
    
    # Verify data for available slot
    available_slot = db_session.query(StagingCourtAvailability).filter_by(
        court_id='1',
        time='9:00 a.m.'
    ).first()
    assert available_slot.status == 'Reserve this time'
    assert available_slot.reservation_link == 'http://test1.com/reserve/1'
    
    # Verify data for unavailable slot
    unavailable_slot = db_session.query(StagingCourtAvailability).filter_by(
        court_id='1',
        time='10:00 a.m.'
    ).first()
    assert unavailable_slot.status == 'Not available'
    assert unavailable_slot.reservation_link is None

def test_merge_availability_to_dwh(db_session, sample_courts_data, sample_csv_files):
    """Test merging availability data from staging to DWH."""
    # Set up required court records
    setup_courts(db_session, sample_courts_data)
    
    # First load data to staging
    file_id = register_file(sample_csv_files['availability'], session=db_session)
    load_availability_to_staging(sample_csv_files['availability'], file_id, db_session)
    
    # Run the merge process
    merge_availability_to_dwh(db_session)
    
    # Query DWH table
    dwh_slots = db_session.query(DwhCourtAvailability).all()
    
    # Verify number of records
    assert len(dwh_slots) == 3
    
    # Verify data and timestamps
    slot = db_session.query(DwhCourtAvailability).filter_by(
        court_id='1',
        time='9:00 a.m.'
    ).first()
    assert slot.status == 'Reserve this time'
    assert slot.reservation_link == 'http://test1.com/reserve/1'
    assert slot.last_updated is not None
    assert slot.last_updated.tzinfo is not None  # Verify timezone awareness

def test_merge_availability_updates_existing(db_session, sample_courts_data, sample_availability_data, sample_csv_files):
    """Test that merging updates existing records in DWH."""
    # Set up required court records and initial data
    setup_courts(db_session, sample_courts_data)
    file_id = register_file(sample_csv_files['availability'], session=db_session)
    load_availability_to_staging(sample_csv_files['availability'], file_id, db_session)
    merge_availability_to_dwh(db_session)
    
    # Modify data in staging
    modified_data = sample_availability_data.copy()
    modified_data.loc[0, 'status'] = 'Not available'
    modified_data.loc[0, 'reservation_link'] = None
    
    # Create temporary file with modified data
    with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as temp_file:
        modified_data.to_csv(temp_file.name, index=False)
        temp_path = temp_file.name
    
    try:
        # Load modified data and merge again
        file_id = register_file(temp_path, session=db_session)
        load_availability_to_staging(temp_path, file_id, db_session)
        merge_availability_to_dwh(db_session)
        
        # Verify updates in DWH
        slot = db_session.query(DwhCourtAvailability).filter_by(
            court_id='1',
            date='2025-08-01',
            time='9:00 a.m.',
            court='Court 1'
        ).first()
        assert slot.status == 'Not available'
        assert slot.reservation_link is None
    finally:
        os.unlink(temp_path)

def test_availability_foreign_key_constraint(db_session, sample_csv_files):
    """Test that availability data respects foreign key constraints."""
    # Try to load availability data without corresponding court records
    file_id = register_file(sample_csv_files['availability'], session=db_session)
    
    with pytest.raises(Exception) as exc_info:
        load_availability_to_staging(sample_csv_files['availability'], file_id, db_session)
    
    # Verify that the error is related to foreign key constraint
    assert "foreign key" in str(exc_info.value).lower()

def test_availability_unique_constraint(db_session, sample_courts_data, sample_csv_files):
    """Test that unique constraints are enforced in DWH."""
    # Set up required court records and initial data
    setup_courts(db_session, sample_courts_data)
    file_id = register_file(sample_csv_files['availability'], session=db_session)
    load_availability_to_staging(sample_csv_files['availability'], file_id, db_session)
    merge_availability_to_dwh(db_session)
    
    # Try to insert duplicate record
    duplicate = DwhCourtAvailability(
        court_id='1',
        date='2025-08-01',
        time='9:00 a.m.',
        court='Court 1',
        status='Not available'
    )
    db_session.add(duplicate)
    
    with pytest.raises(Exception) as exc_info:
        db_session.commit()
    
    # Verify that the error is related to unique constraint
    assert "unique constraint" in str(exc_info.value).lower() 