import sys
from src.etl.availability_loader import run_availability_etl as run_etl

def run_availability_etl():
    """Run the availability ETL process."""
    run_etl()

if __name__ == "__main__":
    run_availability_etl() 