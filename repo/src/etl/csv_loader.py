import pandas as pd
import numpy as np
import hashlib
from datetime import datetime, timedelta
import os
import pytz
from sqlalchemy.orm import Session
from sqlalchemy import text
from src.database.models import (
    FileRegistry, DwhTennisCourt, StagingTennisCourt,
    DwhCourtAvailability, StagingCourtAvailability
)
from src.database.config import SessionLocal, engine
from pathlib import Path

def calculate_file_hash(file_path: str) -> str:
    """Calculate SHA-256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def clean_nan_values(data):
    """Replace NaN values with None in a dictionary."""
    if isinstance(data, dict):
        return {k: clean_nan_values(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [clean_nan_values(v) for v in data]
    elif isinstance(data, float) and np.isnan(data):
        return None
    return data

def cleanup_old_availability(session):
    """Clean up expired availability slots from DWH."""
    try:
        today = datetime.now().date()
        # Use a nested transaction to allow rollback without affecting parent transaction
        with session.begin_nested():
            session.query(DwhCourtAvailability).filter(
                DwhCourtAvailability.date < today
            ).delete(synchronize_session=False)
    except Exception as e:
        session.rollback()
        raise e

def cleanup_processed_files(session, days_threshold=7, include_failed=False):
    """Clean up old processed files from the registry and filesystem.
    
    Args:
        session: Database session
        days_threshold: Number of days after which to clean up files
        include_failed: Whether to include failed files in cleanup
    """
    threshold_date = datetime.now() - timedelta(days=days_threshold)
    
    # Build query for old files
    query = session.query(FileRegistry).filter(
        FileRegistry.load_timestamp < threshold_date,
        FileRegistry.status == 'processed'
    )
    
    if include_failed:
        query = query.union(
            session.query(FileRegistry).filter(
                FileRegistry.load_timestamp < threshold_date,
                FileRegistry.status == 'failed'
            )
        )
    
    # Get files to delete
    files_to_delete = query.all()
    
    # Delete physical files and records
    for file_record in files_to_delete:
        try:
            if os.path.exists(file_record.filepath):
                os.remove(file_record.filepath)
        except OSError:
            # Log error but continue with database cleanup
            print(f"Error deleting file: {file_record.filepath}")
        
        session.delete(file_record)
    
    session.commit()

def validate_court_data(df):
    """Validate court data before loading."""
    # Check required columns
    required_columns = ['court_id', 'park_name', 'lat', 'lon', 'court_type']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}")

    # Prevent test data from being loaded into production
    test_data = df[df['park_name'].str.contains('Test Park', case=False, na=False)]
    if not test_data.empty:
        raise ValueError(f"Test data detected in production load: {test_data['park_name'].tolist()}")

    # Validate coordinates
    invalid_coords = df[
        (df['lat'].astype(float) < -90) | 
        (df['lat'].astype(float) > 90) |
        (df['lon'].astype(float) < -180) | 
        (df['lon'].astype(float) > 180)
    ]
    if not invalid_coords.empty:
        raise ValueError(f"Invalid coordinates found for courts: {invalid_coords['court_id'].tolist()}")

    # Validate court types
    valid_types = ['Hard', 'Clay']
    invalid_types = df[~df['court_type'].isin(valid_types)]
    if not invalid_types.empty:
        raise ValueError(f"Invalid court types found: {invalid_types['court_type'].unique().tolist()}")

    # Check for duplicate court IDs
    duplicates = df[df.duplicated(['court_id'], keep=False)]
    if not duplicates.empty:
        raise ValueError(f"Duplicate court IDs found: {duplicates['court_id'].unique().tolist()}")

def validate_availability_data(df):
    """Validate availability data before loading."""
    # Check required columns
    required_columns = ['park_id', 'date', 'time', 'court_id', 'status', 'reservation_link', 'is_available']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}")

    # Convert dates to datetime
    df['date'] = pd.to_datetime(df['date']).dt.date

    # Validate time format (HH:MM a.m./p.m.)
    def is_valid_time(time_str):
        try:
            datetime.strptime(time_str, '%I:%M %p')
            return True
        except ValueError:
            try:
                datetime.strptime(time_str, '%I:%M a.m.')
                return True
            except ValueError:
                try:
                    datetime.strptime(time_str, '%I:%M p.m.')
                    return True
                except ValueError:
                    return False

    invalid_times = df[~df['time'].apply(is_valid_time)]
    if not invalid_times.empty:
        raise ValueError(f"Invalid time format found: {invalid_times['time'].unique().tolist()}")

    # Validate that all slots are available
    unavailable_slots = df[~df['is_available']]
    if not unavailable_slots.empty:
        raise ValueError("Found unavailable slots in the data. Only available slots should be included.")

def load_courts_to_staging(df, session):
    """Load tennis courts data to staging table."""
    try:
        # Validate data
        validate_court_data(df)

        # Clear staging table
        session.query(StagingTennisCourt).delete()

        # Load data to staging
        for _, row in df.iterrows():
            court = StagingTennisCourt(
                park_id=str(row['court_id']),  # The CSV still has court_id column, but we store it as park_id
                park_name=row['park_name'],
                park_details=row.get('park_details'),
                address=row.get('address'),
                phone=row.get('phone'),
                email=row.get('email'),
                hours=row.get('hours'),
                website=row.get('website'),
                num_courts=row.get('num_courts'),
                lat=row['lat'],
                lon=row['lon'],
                court_type=row['court_type']
            )
            session.add(court)

        session.commit()
    except Exception as e:
        session.rollback()
        raise e

def merge_courts_to_dwh(session):
    """Merge courts data from staging to DWH."""
    try:
        # Get staging data
        staging_data = session.query(StagingTennisCourt).all()

        # Update or insert records
        for staging_court in staging_data:
            dwh_court = session.query(DwhTennisCourt).filter_by(
                park_id=staging_court.park_id
            ).first()

            if dwh_court:
                # Update existing record
                for attr in ['park_name', 'park_details', 'address', 'phone',
                           'email', 'hours', 'website', 'num_courts', 'lat',
                           'lon', 'court_type']:
                    setattr(dwh_court, attr, getattr(staging_court, attr))
            else:
                # Insert new record
                dwh_court = DwhTennisCourt(
                    park_id=staging_court.park_id,
                    park_name=staging_court.park_name,
                    park_details=staging_court.park_details,
                    address=staging_court.address,
                    phone=staging_court.phone,
                    email=staging_court.email,
                    hours=staging_court.hours,
                    website=staging_court.website,
                    num_courts=staging_court.num_courts,
                    lat=staging_court.lat,
                    lon=staging_court.lon,
                    court_type=staging_court.court_type
                )
                session.add(dwh_court)

        session.commit()
    except Exception as e:
        session.rollback()
        raise e

def load_availability_to_staging(file_path, file_id, session):
    """Load availability data to staging table."""
    try:
        # Read and validate data
        df = pd.read_csv(file_path)
        validate_availability_data(df)

        # Clean NaN values
        df['reservation_link'] = df['reservation_link'].fillna('')

        # Clear staging table
        session.query(StagingCourtAvailability).delete()

        # Load data to staging
        for _, row in df.iterrows():
            availability = StagingCourtAvailability(
                park_id=str(row['park_id']),
                court_id=str(row['court_id']),
                date=row['date'],
                time=row['time'],
                status=row['status'],
                reservation_link=row['reservation_link'] if row['reservation_link'] else None,
                is_available=row['is_available'],
                file_id=file_id
            )
            session.add(availability)

        session.commit()
        update_file_status(file_id, 'processed', session)
    except Exception as e:
        session.rollback()
        update_file_status(file_id, 'failed', session)
        raise e

def merge_availability_to_dwh(session):
    """Merge availability data from staging to DWH."""
    try:
        # Get staging data
        staging_data = session.query(StagingCourtAvailability).all()

        # Update or insert records
        for staging_slot in staging_data:
            dwh_slot = session.query(DwhCourtAvailability).filter_by(
                park_id=staging_slot.park_id,
                court_id=staging_slot.court_id,
                date=staging_slot.date,
                time=staging_slot.time
            ).first()

            if dwh_slot:
                # Update existing record
                dwh_slot.status = staging_slot.status
                dwh_slot.reservation_link = staging_slot.reservation_link
                dwh_slot.last_updated = datetime.now(pytz.UTC)
            else:
                # Insert new record
                dwh_slot = DwhCourtAvailability(
                    park_id=staging_slot.park_id,
                    court_id=staging_slot.court_id,
                    date=staging_slot.date,
                    time=staging_slot.time,
                    status=staging_slot.status,
                    reservation_link=staging_slot.reservation_link,
                    is_available=staging_slot.is_available
                )
                session.add(dwh_slot)

        session.commit()
    except Exception as e:
        session.rollback()
        raise e

def register_file(file_path, session):
    """Register a file in the registry."""
    file_hash = hashlib.sha256(open(file_path, 'rb').read()).hexdigest()
    file_record = FileRegistry(
        filename=os.path.basename(file_path),
        filepath=file_path,
        file_hash=file_hash,
        status='pending'
    )
    session.add(file_record)
    session.commit()
    return file_record.id

def update_file_status(file_id, status, session):
    """Update file status in the registry."""
    file_record = session.get(FileRegistry, file_id)
    if file_record:
        file_record.status = status
        session.commit()

def run_courts_etl():
    """Run the full ETL process for tennis courts"""
    # Read the CSV file
    df = pd.read_csv('nyc_tennis_courts.csv')
    
    # Create a session
    session = SessionLocal()
    try:
        # Load to staging
        load_courts_to_staging(df, session)
        
        # Merge to DWH
        merge_courts_to_dwh(session)
    finally:
        session.close()

def run_availability_etl(file_path: str):
    """Run the full ETL process for court availability"""
    # Create a session
    session = SessionLocal()
    try:
        # Register file
        file_id = register_file(file_path, session)
        
        # Load to staging
        load_availability_to_staging(file_path, file_id, session)
        
        # Merge to DWH
        merge_availability_to_dwh(session)
        
        # Update file status to 'processed'
        update_file_status(file_id, 'processed', session)
        
    except Exception as e:
        if 'file_id' in locals():
            update_file_status(file_id, 'failed', session)
        raise e
    finally:
        session.close() 