import pytest
from unittest.mock import patch, MagicMock
from src.etl.run_etl import run_etl
from src.etl.run_availability_etl import run_availability_etl

@patch('src.etl.run_etl.run_courts_etl')
@patch('src.etl.run_etl.run_availability_etl')
def test_run_etl_both(mock_availability_etl, mock_courts_etl):
    """Test running both ETL processes."""
    run_etl('both')
    
    mock_courts_etl.assert_called_once()
    mock_availability_etl.assert_called_once()

@patch('src.etl.run_etl.run_courts_etl')
@patch('src.etl.run_etl.run_availability_etl')
def test_run_etl_courts(mock_availability_etl, mock_courts_etl):
    """Test running only courts ETL."""
    run_etl('courts')
    
    mock_courts_etl.assert_called_once()
    mock_availability_etl.assert_not_called()

@patch('src.etl.run_etl.run_courts_etl')
@patch('src.etl.run_etl.run_availability_etl')
def test_run_etl_availability(mock_availability_etl, mock_courts_etl):
    """Test running only availability ETL."""
    run_etl('availability')
    
    mock_courts_etl.assert_not_called()
    mock_availability_etl.assert_called_once()

@patch('src.etl.run_etl.run_courts_etl')
@patch('src.etl.run_etl.run_availability_etl')
def test_run_etl_invalid_type(mock_availability_etl, mock_courts_etl):
    """Test running ETL with invalid type."""
    with pytest.raises(ValueError) as exc_info:
        run_etl('invalid')
    
    assert str(exc_info.value) == "Invalid ETL type. Must be one of: courts, availability, both"
    mock_courts_etl.assert_not_called()
    mock_availability_etl.assert_not_called()

@patch('src.etl.run_availability_etl.run_availability_etl')
def test_run_availability_etl_script(mock_availability_etl):
    """Test running the availability ETL script."""
    run_availability_etl()
    mock_availability_etl.assert_called_once() 