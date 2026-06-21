import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
import os
from src.court_availability_finder import (
    get_availability_data, save_availability_data, main,
    parse_availability_table
)

@patch('requests.get')
def test_get_availability_data(mock_get):
    """Test getting availability data."""
    # Mock response
    mock_response = MagicMock()
    mock_response.text = """
    <table class="table">
        <tr>
            <th>Time</th>
            <th>Court 1</th>
            <th>Court 2</th>
        </tr>
        <tr>
            <td>9:00 a.m.</td>
            <td><a href="https://www.nycgovparks.org/tennisreservation/reserve/123">Reserve this time</a></td>
            <td>Not available</td>
        </tr>
    </table>
    """
    mock_get.return_value = mock_response

    data = get_availability_data('12', '2025-08-01')
    assert isinstance(data, list)
    assert len(data) > 0
    
    # Check data structure
    first_item = data[0]
    assert 'court_id' in first_item
    assert 'date' in first_item
    assert 'time' in first_item
    assert 'court' in first_item
    assert 'status' in first_item
    assert 'reservation_link' in first_item

    # Verify data types
    assert isinstance(first_item['court_id'], str)
    assert isinstance(first_item['date'], str)
    assert isinstance(first_item['time'], str)
    assert isinstance(first_item['court'], str)
    assert isinstance(first_item['status'], str)
    assert isinstance(first_item['reservation_link'], (str, type(None)))

def test_save_availability_data(tmp_path):
    """Test saving availability data to CSV."""
    data = [
        {
            'court_id': '12',
            'date': '2025-08-01',
            'time': '9:00 a.m.',
            'court': 'Court 1',
            'status': 'Reserve this time',
            'reservation_link': 'https://www.nycgovparks.org/tennisreservation/reserve/123'
        }
    ]

    # Create a temporary directory for output
    output_dir = tmp_path / "data" / "court_availability" / "raw_files"
    output_dir.mkdir(parents=True)

    # Save data
    save_availability_data(data, str(output_dir))

    # Check that file was created
    files = list(output_dir.glob('court_availability_*.csv'))
    assert len(files) == 1

    # Check file contents
    df = pd.read_csv(files[0])
    assert len(df) == 1
    assert str(df.iloc[0]['court_id']) == '12'
    assert df.iloc[0]['date'] == '2025-08-01'
    assert df.iloc[0]['time'] == '9:00 a.m.'
    assert df.iloc[0]['court'] == 'Court 1'
    assert df.iloc[0]['status'] == 'Reserve this time'
    assert df.iloc[0]['reservation_link'] == 'https://www.nycgovparks.org/tennisreservation/reserve/123'

@patch('requests.get')
def test_main(mock_get, tmp_path):
    """Test the main function."""
    # Mock response
    mock_response = MagicMock()
    mock_response.text = """
    <table class="table">
        <tr>
            <th>Time</th>
            <th>Court 1</th>
        </tr>
        <tr>
            <td>9:00 a.m.</td>
            <td><a href="https://www.nycgovparks.org/tennisreservation/reserve/123">Reserve this time</a></td>
        </tr>
    </table>
    """
    mock_get.return_value = mock_response

    # Create temporary courts CSV
    courts_df = pd.DataFrame([{'court_id': '12'}])
    courts_file = tmp_path / "nyc_tennis_courts.csv"
    courts_df.to_csv(courts_file, index=False)

    # Create a temporary directory for output
    output_dir = tmp_path / "data" / "court_availability" / "raw_files"
    output_dir.mkdir(parents=True)

    # Run main with test data
    with patch('src.court_availability_finder.OUTPUT_DIR', str(output_dir)):
        with patch.dict(os.environ, {'COURTS_FILE': str(courts_file)}):
            main()

    # Check that file was created
    files = list(output_dir.glob('court_availability_*.csv'))
    assert len(files) == 1

    # Check file contents
    df = pd.read_csv(files[0])
    assert len(df) == 1
    assert str(df.iloc[0]['court_id']) == '12'
    assert df.iloc[0]['court'] == 'Court 1'
    assert df.iloc[0]['status'] == 'Reserve this time'
    assert df.iloc[0]['reservation_link'] == 'https://www.nycgovparks.org/tennisreservation/reserve/123' 