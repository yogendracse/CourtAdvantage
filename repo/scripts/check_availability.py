import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from src.database.config import SessionLocal

def check_availability():
    session = SessionLocal()
    try:
        # Query latest availability data
        result = session.execute(text("""
            SELECT court_id, date, time, court, status, reservation_link, is_available
            FROM dwh.court_availability
            WHERE date >= CURRENT_DATE
            ORDER BY court_id, date, time
            LIMIT 10
        """))
        
        print("\nLatest availability data in DWH:")
        print("=" * 120)
        print("Court ID | Date       | Time     | Court Name | Status | Available | Has Link")
        print("-" * 120)
        for row in result:
            print(f"{row[0]:8} | {row[1]} | {row[2]:8} | {row[3]:10} | {row[4]:6} | {row[6]:9} | {'Yes' if row[5] else 'No'}")
            
        # Get some stats
        result = session.execute(text("""
            SELECT 
                COUNT(*) as total_slots,
                COUNT(CASE WHEN is_available THEN 1 END) as available_slots,
                COUNT(DISTINCT court_id) as unique_courts,
                MIN(date) as earliest_date,
                MAX(date) as latest_date
            FROM dwh.court_availability
            WHERE date >= CURRENT_DATE
        """))
        
        print("\nAvailability Stats:")
        print("=" * 80)
        for row in result:
            print(f"Total slots: {row[0]}")
            print(f"Available slots: {row[1]}")
            print(f"Unique courts: {row[2]}")
            print(f"Date range: {row[3]} to {row[4]}")
            
    finally:
        session.close()

if __name__ == "__main__":
    check_availability()
