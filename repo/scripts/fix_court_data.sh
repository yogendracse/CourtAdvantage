#!/bin/bash

# Create a temporary Python script for cleanup
cat > cleanup_temp.py << 'EOL'
from sqlalchemy import text
from src.database.config import SessionLocal

def cleanup_test_data():
    session = SessionLocal()
    try:
        # First delete availability data
        session.execute(text("""
            DELETE FROM dwh.court_availability 
            WHERE court_id IN ('1')
            OR court_id IN (
                SELECT court_id 
                FROM dwh.tennis_courts 
                WHERE park_name IN ('Test Park 1', 'Test Park 2', 'Updated Park 1')
                OR address LIKE '%Test St%'
            )
        """))

        session.execute(text("""
            DELETE FROM staging.court_availability 
            WHERE court_id IN ('1')
            OR court_id IN (
                SELECT court_id 
                FROM staging.tennis_courts 
                WHERE park_name IN ('Test Park 1', 'Test Park 2', 'Updated Park 1')
                OR address LIKE '%Test St%'
            )
        """))

        # Then delete court data
        session.execute(text("""
            DELETE FROM dwh.tennis_courts 
            WHERE park_name IN ('Test Park 1', 'Test Park 2', 'Updated Park 1')
            OR address LIKE '%Test St%'
            OR court_id = '1'
        """))

        session.execute(text("""
            DELETE FROM staging.tennis_courts 
            WHERE park_name IN ('Test Park 1', 'Test Park 2', 'Updated Park 1')
            OR address LIKE '%Test St%'
            OR court_id = '1'
        """))

        session.commit()
        print("Test data cleanup completed successfully!")
    except Exception as e:
        session.rollback()
        print(f"Error during cleanup: {e}")
        raise
    finally:
        session.close()

if __name__ == "__main__":
    cleanup_test_data()
EOL

# Run cleanup script
python cleanup_temp.py

# Run the courts ETL to reload correct data
python -c "from src.etl.csv_loader import run_courts_etl; run_courts_etl()"

# Clean up temporary file
rm cleanup_temp.py

echo "Court data has been fixed!" 