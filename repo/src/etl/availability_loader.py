import os
from pathlib import Path
from datetime import datetime
from typing import Optional
from src.etl.csv_loader import (
    register_file, load_availability_to_staging,
    merge_availability_to_dwh, update_file_status
)
from src.database.config import SessionLocal

def get_latest_file(data_dir: str) -> str:
    """Get the latest availability file from the data directory."""
    files = [f for f in os.listdir(data_dir) if f.startswith('court_availability_')]
    if not files:
        raise FileNotFoundError("No availability files found")
    
    latest = max(files)
    return os.path.join(data_dir, latest)

def process_file(file_path: str, session=None) -> None:
    """Process a single availability file."""
    # Create session if not provided
    if session is None:
        session = SessionLocal()
        should_close = True
    else:
        should_close = False
    
    try:
        # Register file
        file_id = register_file(file_path, session=session)
        
        # Load to staging
        load_availability_to_staging(file_path, file_id, session)
        
        # Merge to DWH
        merge_availability_to_dwh(session)
        
        # Update file status
        update_file_status(file_id, 'processed', session)
    finally:
        if should_close:
            session.close()

def run_availability_etl() -> None:
    """Run the availability ETL process."""
    # Get the data directory
    base_dir = Path(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    data_dir = base_dir / 'data' / 'court_availability' / 'raw_files'
    
    # Get latest file
    latest_file = get_latest_file(str(data_dir))
    
    # Process file
    process_file(latest_file) 