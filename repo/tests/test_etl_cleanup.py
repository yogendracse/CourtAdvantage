import pytest
from datetime import datetime, timedelta
import os
import tempfile
import hashlib
from src.etl.csv_loader import (
    load_availability_to_staging, merge_availability_to_dwh,
    register_file, update_file_status, cleanup_old_availability,
    cleanup_processed_files
)
from src.database.models import (
    DwhCourtAvailability, FileRegistry, DwhTennisCourt
)

def calculate_file_hash(file_path):
    """Helper function to calculate file hash."""
    return hashlib.sha256(open(file_path, 'rb').read()).hexdigest()

def test_cleanup_expired_availability(db_session):
    """Test cleanup of expired availability slots."""
    # Set up a court
    court = DwhTennisCourt(
        court_id='1',
        park_name='Test Park',
        court_type='Hard'
    )
    db_session.add(court)
    db_session.commit()

    # Create some expired and future availability records
    yesterday = datetime.now() - timedelta(days=1)
    tomorrow = datetime.now() + timedelta(days=1)
    next_week = datetime.now() + timedelta(days=7)

    expired_slot = DwhCourtAvailability(
        court_id='1',
        date=yesterday.date(),
        time='9:00 a.m.',
        court='Court 1',
        status='Available'
    )

    future_slot1 = DwhCourtAvailability(
        court_id='1',
        date=tomorrow.date(),
        time='10:00 a.m.',
        court='Court 1',
        status='Available'
    )

    future_slot2 = DwhCourtAvailability(
        court_id='1',
        date=next_week.date(),
        time='2:00 p.m.',
        court='Court 1',
        status='Available'
    )

    db_session.add_all([expired_slot, future_slot1, future_slot2])
    db_session.commit()

    # Run cleanup
    cleanup_old_availability(db_session)

    # Verify expired slot is removed
    remaining_slots = db_session.query(DwhCourtAvailability).all()
    assert len(remaining_slots) == 2
    dates = [slot.date for slot in remaining_slots]
    assert yesterday.date() not in dates
    assert tomorrow.date() in dates
    assert next_week.date() in dates

def test_cleanup_processed_files(db_session):
    """Test cleanup of old processed files."""
    # Create temporary files
    temp_files = []
    for i in range(3):
        with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as temp_file:
            temp_file.write(b"test data")
            temp_files.append(temp_file.name)

    try:
        # Register files with different dates
        old_file = FileRegistry(
            filename=os.path.basename(temp_files[0]),
            filepath=temp_files[0],
            file_hash=calculate_file_hash(temp_files[0]),
            status='processed',
            load_timestamp=datetime.now() - timedelta(days=8)
        )

        recent_file = FileRegistry(
            filename=os.path.basename(temp_files[1]),
            filepath=temp_files[1],
            file_hash=calculate_file_hash(temp_files[1]),
            status='processed',
            load_timestamp=datetime.now() - timedelta(days=3)
        )

        pending_file = FileRegistry(
            filename=os.path.basename(temp_files[2]),
            filepath=temp_files[2],
            file_hash=calculate_file_hash(temp_files[2]),
            status='pending',
            load_timestamp=datetime.now() - timedelta(days=8)
        )

        db_session.add_all([old_file, recent_file, pending_file])
        db_session.commit()

        # Run cleanup (files older than 7 days)
        cleanup_processed_files(db_session, days_threshold=7)

        # Verify old processed file is removed
        remaining_files = db_session.query(FileRegistry).all()
        filenames = [f.filename for f in remaining_files]
        
        assert os.path.basename(temp_files[0]) not in filenames  # Old file removed
        assert os.path.basename(temp_files[1]) in filenames     # Recent file kept
        assert os.path.basename(temp_files[2]) in filenames     # Pending file kept
        
        # Verify physical file is removed
        assert not os.path.exists(temp_files[0])
        assert os.path.exists(temp_files[1])
        assert os.path.exists(temp_files[2])

    finally:
        # Cleanup remaining temporary files
        for file_path in temp_files[1:]:
            if os.path.exists(file_path):
                os.unlink(file_path)

def test_cleanup_failed_files(db_session):
    """Test cleanup of failed file records."""
    # Create temporary files
    temp_files = []
    for i in range(2):
        with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as temp_file:
            temp_file.write(b"test data")
            temp_files.append(temp_file.name)

    try:
        # Register files with failed status
        old_failed = FileRegistry(
            filename=os.path.basename(temp_files[0]),
            filepath=temp_files[0],
            file_hash=calculate_file_hash(temp_files[0]),
            status='failed',
            load_timestamp=datetime.now() - timedelta(days=8)
        )

        recent_failed = FileRegistry(
            filename=os.path.basename(temp_files[1]),
            filepath=temp_files[1],
            file_hash=calculate_file_hash(temp_files[1]),
            status='failed',
            load_timestamp=datetime.now() - timedelta(hours=12)
        )

        db_session.add_all([old_failed, recent_failed])
        db_session.commit()

        # Run cleanup (failed files older than 24 hours)
        cleanup_processed_files(db_session, days_threshold=1, include_failed=True)

        # Verify old failed file is removed but recent one is kept
        remaining_files = db_session.query(FileRegistry).all()
        filenames = [f.filename for f in remaining_files]
        
        assert os.path.basename(temp_files[0]) not in filenames  # Old file removed
        assert os.path.basename(temp_files[1]) in filenames      # Recent file kept

    finally:
        # Cleanup remaining temporary files
        for file_path in temp_files:
            if os.path.exists(file_path):
                os.unlink(file_path)

def test_cleanup_with_transaction_rollback(db_session):
    """Test cleanup process handles transaction rollback correctly."""
    # Set up a court
    court = DwhTennisCourt(
        court_id='1',
        park_name='Test Park',
        court_type='Hard'
    )
    db_session.add(court)
    db_session.commit()

    # Create availability records
    yesterday = datetime.now() - timedelta(days=1)
    tomorrow = datetime.now() + timedelta(days=1)

    expired_slot = DwhCourtAvailability(
        court_id='1',
        date=yesterday.date(),
        time='9:00 a.m.',
        court='Court 1',
        status='Available'
    )

    future_slot = DwhCourtAvailability(
        court_id='1',
        date=tomorrow.date(),
        time='10:00 a.m.',
        court='Court 1',
        status='Available'
    )

    db_session.add_all([expired_slot, future_slot])
    db_session.commit()

    # Force a rollback during cleanup
    with pytest.raises(Exception):
        with db_session.begin_nested():
            cleanup_old_availability(db_session)
            raise Exception("Forced rollback")

    # Verify all records still exist
    remaining_slots = db_session.query(DwhCourtAvailability).all()
    assert len(remaining_slots) == 2  # Both records should still exist 