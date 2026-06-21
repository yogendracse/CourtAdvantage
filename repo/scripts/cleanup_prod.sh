#!/bin/bash

# Exit on any error
set -e

# Load environment variables
source .env

# Run cleanup processes
DB_NAME=nyc_tennis_prod python -c "
from src.etl.csv_loader import cleanup_old_availability, cleanup_processed_files
from src.database.config import SessionLocal

session = SessionLocal()
try:
    print('Starting production cleanup...')
    
    # Clean up expired availability slots
    print('Cleaning up expired availability slots...')
    cleanup_old_availability(session)
    
    # Clean up old processed files (14 days in production)
    print('Cleaning up old processed files...')
    cleanup_processed_files(session, days_threshold=14)
    
    # Clean up failed files (2 days in production)
    print('Cleaning up failed files...')
    cleanup_processed_files(session, days_threshold=2, include_failed=True)
    
    print('Production cleanup completed successfully!')
except Exception as e:
    print(f'Error during production cleanup: {str(e)}')
    exit(1)
finally:
    session.close()
" 