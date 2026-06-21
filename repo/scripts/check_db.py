import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from src.database.config import SessionLocal

def check_courts():
    session = SessionLocal()
    try:
        # Query all courts from dwh
        result = session.execute(text("""
            SELECT court_id, park_name, address 
            FROM dwh.tennis_courts 
            ORDER BY court_id
        """))
        
        print("\nCurrent courts in DWH:")
        print("=" * 80)
        for row in result:
            print(f"ID: {row[0]}, Name: {row[1]}, Address: {row[2]}")
            
        # Query staging table as well
        result = session.execute(text("""
            SELECT court_id, park_name, address 
            FROM staging.tennis_courts 
            ORDER BY court_id
        """))
        
        print("\nCurrent courts in Staging:")
        print("=" * 80)
        for row in result:
            print(f"ID: {row[0]}, Name: {row[1]}, Address: {row[2]}")
            
    finally:
        session.close()

if __name__ == "__main__":
    check_courts() 