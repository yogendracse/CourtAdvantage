import pytest
from unittest.mock import patch, MagicMock
from src.etl.availability_loader import (
    get_latest_file, process_file, run_availability_etl
)
import os
import pandas as pd
from datetime import datetime

@pytest.fixture
def sample_file(tmp_path):
    """Create a sample availability file."""
    data = pd.DataFrame([
        {
            'court_id': '12',
            'date': '2025-08-01',
            'time': '9:00 a.m.',
            'court': 'Court 1',
            'status': 'Reserve this time',
            'reservation_link': 'https://www.nycgovparks.org/tennisreservation/reserve/123'
        }
    ])
    
    # Create a temporary directory for output
    output_dir = tmp_path / "data" / "court_availability" / "raw_files"
    output_dir.mkdir(parents=True)
    
    # Save file
    file_path = output_dir / f"court_availability_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    data.to_csv(file_path, index=False)
    
    return str(file_path)

def test_get_latest_file(tmp_path):
    """Test getting the latest availability file."""
    # Create test files with different timestamps
    data_dir = tmp_path / "data" / "court_availability" / "raw_files"
    data_dir.mkdir(parents=True)
    
    # Create files
    file1 = data_dir / "court_availability_20250801_090000.csv"
    file2 = data_dir / "court_availability_20250801_100000.csv"
    file1.touch()
    file2.touch()
    
    # Get latest file
    latest = get_latest_file(str(data_dir))
    assert os.path.basename(latest) == "court_availability_20250801_100000.csv"

@patch('src.etl.availability_loader.register_file')
@patch('src.etl.availability_loader.load_availability_to_staging')
@patch('src.etl.availability_loader.merge_availability_to_dwh')
@patch('src.etl.availability_loader.update_file_status')
def test_process_file(
    mock_update_status, mock_merge, mock_load, mock_register,
    sample_file, db_session
):
    """Test processing an availability file."""
    # Mock file registration
    mock_register.return_value = 1
    
    # Process file
    process_file(sample_file, db_session)
    
    # Verify function calls
    mock_register.assert_called_once_with(sample_file, session=db_session)
    mock_load.assert_called_once_with(sample_file, 1, db_session)
    mock_merge.assert_called_once_with(db_session)
    mock_update_status.assert_called_once_with(1, 'processed', db_session)

@patch('src.etl.availability_loader.get_latest_file')
@patch('src.etl.availability_loader.process_file')
def test_run_availability_etl(mock_process, mock_get_latest, sample_file):
    """Test running the full availability ETL process."""
    # Mock getting latest file
    mock_get_latest.return_value = sample_file
    
    # Run ETL
    run_availability_etl()
    
    # Verify function calls
    mock_get_latest.assert_called_once()
    mock_process.assert_called_once_with(sample_file) 