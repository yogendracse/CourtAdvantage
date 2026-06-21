import os
import sys
import argparse
from pathlib import Path
from src.etl.csv_loader import run_courts_etl
from src.etl.availability_loader import run_availability_etl

def run_etl(etl_type: str):
    """Run the ETL process.
    
    Args:
        etl_type: Type of ETL to run. Must be one of: courts, availability, both
    """
    if etl_type not in ['courts', 'availability', 'both']:
        raise ValueError("Invalid ETL type. Must be one of: courts, availability, both")
    
    if etl_type in ['courts', 'both']:
        run_courts_etl()
    
    if etl_type in ['availability', 'both']:
        run_availability_etl()

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Run the ETL process.')
    parser.add_argument(
        '--type',
        choices=['courts', 'availability', 'both'],
        default='both',
        help='Type of ETL to run'
    )
    
    args = parser.parse_args()
    run_etl(args.type) 