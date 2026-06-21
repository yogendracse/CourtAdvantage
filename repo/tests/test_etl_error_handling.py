import pytest
import pandas as pd
import tempfile
import os
from datetime import datetime, timedelta
from src.etl.csv_loader import (
    load_availability_to_staging, merge_availability_to_dwh,
    register_file, update_file_status, load_courts_to_staging
)
from src.database.models import (
    StagingCourtAvailability, DwhCourtAvailability,
    FileRegistry, DwhTennisCourt
)

def test_invalid_csv_format(db_session):
    """Test handling of malformed CSV files."""
    # Create an invalid CSV file
    with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as temp_file:
        temp_file.write(b"invalid,csv,format\nno,proper,headers\n")
        temp_path = temp_file.name

    try:
        # Register file
        file_id = register_file(temp_path, session=db_session)

        # Attempt to load invalid file
        with pytest.raises(ValueError) as exc_info:
            load_availability_to_staging(temp_path, file_id, db_session)

        # Verify file status is updated to 'failed'
        file_record = db_session.get(FileRegistry, file_id)
        assert file_record.status == 'failed'
        assert "Missing required columns" in str(exc_info.value)
    finally:
        os.unlink(temp_path)

def test_invalid_court_coordinates(db_session):
    """Test validation of court coordinates."""
    invalid_courts_data = pd.DataFrame([{
        'court_id': '1',
        'park_name': 'Invalid Court',
        'lat': 200,  # Invalid latitude
        'lon': -200,  # Invalid longitude
        'court_type': 'Hard'
    }])

    with pytest.raises(ValueError) as exc_info:
        load_courts_to_staging(invalid_courts_data, db_session)
    
    assert "Invalid coordinates" in str(exc_info.value)

def test_invalid_court_type(db_session):
    """Test validation of court types."""
    invalid_courts_data = pd.DataFrame([{
        'court_id': '1',
        'park_name': 'Invalid Court',
        'lat': 40.7128,
        'lon': -74.0060,
        'court_type': 'Invalid'  # Invalid court type
    }])

    with pytest.raises(ValueError) as exc_info:
        load_courts_to_staging(invalid_courts_data, db_session)
    
    assert "Invalid court type" in str(exc_info.value)

def test_duplicate_court_id(db_session, sample_courts_data):
    """Test handling of duplicate court IDs."""
    # Create data with duplicate court_id
    duplicate_data = pd.concat([sample_courts_data, sample_courts_data.iloc[0:1]])
    
    with pytest.raises(Exception) as exc_info:
        load_courts_to_staging(duplicate_data, db_session)
    
    assert "duplicate" in str(exc_info.value).lower()

def test_future_date_validation(db_session, sample_courts_data):
    """Test validation of availability dates."""
    # Set up required court records
    court = DwhTennisCourt(
        court_id='1',
        park_name='Test Park',
        court_type='Hard'
    )
    db_session.add(court)
    db_session.commit()

    # Create availability data with past date
    past_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    invalid_data = pd.DataFrame([{
        'court_id': '1',
        'date': past_date,
        'time': '9:00 a.m.',
        'court': 'Court 1',
        'status': 'Available'
    }])

    # Create temporary file
    with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as temp_file:
        invalid_data.to_csv(temp_file.name, index=False)
        temp_path = temp_file.name

    try:
        file_id = register_file(temp_path, session=db_session)
        with pytest.raises(ValueError) as exc_info:
            load_availability_to_staging(temp_path, file_id, db_session)
        assert "past date" in str(exc_info.value).lower()
    finally:
        os.unlink(temp_path)

def test_invalid_time_format(db_session, sample_courts_data):
    """Test validation of time formats."""
    # Set up required court records
    court = DwhTennisCourt(
        court_id='1',
        park_name='Test Park',
        court_type='Hard'
    )
    db_session.add(court)
    db_session.commit()

    # Create availability data with invalid time format
    invalid_data = pd.DataFrame([{
        'court_id': '1',
        'date': '2025-08-01',
        'time': '25:00',  # Invalid time
        'court': 'Court 1',
        'status': 'Available'
    }])

    # Create temporary file
    with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as temp_file:
        invalid_data.to_csv(temp_file.name, index=False)
        temp_path = temp_file.name

    try:
        file_id = register_file(temp_path, session=db_session)
        with pytest.raises(ValueError) as exc_info:
            load_availability_to_staging(temp_path, file_id, db_session)
        assert "invalid time format" in str(exc_info.value).lower()
    finally:
        os.unlink(temp_path) 