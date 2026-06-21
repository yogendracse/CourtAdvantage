#!/usr/bin/env python3
"""Script to verify the new database schema and data structure."""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.database.config import SessionLocal
from sqlalchemy import text

def check_database_structure():
    """Check the current database structure."""
    session = SessionLocal()
    
    try:
        print("=== DATABASE STRUCTURE VERIFICATION ===\n")
        
        # Check tennis_courts table structure
        print("1. Tennis Courts Table Structure:")
        result = session.execute(text("""
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_schema = 'dwh' AND table_name = 'tennis_courts' 
            ORDER BY ordinal_position
        """))
        columns = result.fetchall()
        for col in columns:
            print(f"   {col[0]}: {col[1]} ({'NULL' if col[2] == 'YES' else 'NOT NULL'})")
        
        print("\n2. Court Availability Table Structure:")
        result = session.execute(text("""
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_schema = 'dwh' AND table_name = 'court_availability' 
            ORDER BY ordinal_position
        """))
        columns = result.fetchall()
        for col in columns:
            print(f"   {col[0]}: {col[1]} ({'NULL' if col[2] == 'YES' else 'NOT NULL'})")
        
        print("\n=== DATA VERIFICATION ===\n")
        
        # Check tennis courts data
        print("3. Tennis Courts Data:")
        result = session.execute(text("""
            SELECT park_id, park_name, num_courts 
            FROM dwh.tennis_courts 
            ORDER BY park_id
        """))
        courts = result.fetchall()
        for court in courts:
            print(f"   Park ID: {court[0]}, Name: {court[1]}, Courts: {court[2]}")
        
        print("\n4. Court Availability Data Summary:")
        result = session.execute(text("""
            SELECT 
                COUNT(*) as total_slots,
                COUNT(CASE WHEN is_available = true THEN 1 END) as available_slots,
                COUNT(DISTINCT park_id) as unique_parks,
                COUNT(DISTINCT court_id) as unique_courts,
                MIN(date) as earliest_date,
                MAX(date) as latest_date
            FROM dwh.court_availability
        """))
        summary = result.fetchone()
        print(f"   Total slots: {summary[0]}")
        print(f"   Available slots: {summary[1]}")
        print(f"   Unique parks: {summary[2]}")
        print(f"   Unique courts: {summary[3]}")
        print(f"   Date range: {summary[4]} to {summary[5]}")
        
        print("\n5. Sample Court Availability Data:")
        result = session.execute(text("""
            SELECT park_id, court_id, date, time, status
            FROM dwh.court_availability 
            ORDER BY date, time 
            LIMIT 10
        """))
        slots = result.fetchall()
        for slot in slots:
            print(f"   Park {slot[0]}, Court {slot[1]}, {slot[2]} at {slot[3]}: {slot[4]}")
        
        print("\n6. Courts per Park:")
        result = session.execute(text("""
            SELECT 
                ca.park_id,
                tc.park_name,
                COUNT(DISTINCT ca.court_id) as num_courts,
                STRING_AGG(DISTINCT ca.court_id::text, ', ' ORDER BY ca.court_id::integer) as court_numbers
            FROM dwh.court_availability ca
            JOIN dwh.tennis_courts tc ON ca.park_id = tc.park_id
            GROUP BY ca.park_id, tc.park_name
            ORDER BY ca.park_id
        """))
        parks = result.fetchall()
        for park in parks:
            print(f"   Park {park[0]} ({park[1]}): {park[2]} courts - {park[3]}")
        
        print("\n=== SCHEMA VALIDATION ===\n")
        
        # Check foreign key relationships
        print("7. Foreign Key Relationships:")
        result = session.execute(text("""
            SELECT 
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' 
                AND tc.table_schema = 'dwh'
                AND tc.table_name IN ('court_availability', 'tennis_courts')
            ORDER BY tc.table_name, kcu.column_name
        """))
        fks = result.fetchall()
        for fk in fks:
            print(f"   {fk[0]}.{fk[1]} -> {fk[2]}.{fk[3]}")
        
        print("\n✅ Database schema and data verification complete!")
        
    except Exception as e:
        print(f"❌ Error during verification: {e}")
        session.rollback()
        raise
    finally:
        session.close()

if __name__ == "__main__":
    check_database_structure()
