import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from src.database.models import Base, DwhTennisCourt, StagingTennisCourt
import pandas as pd
import tempfile

# Load environment variables
load_dotenv()

# Test database settings
TEST_DB_NAME = "nyc_tennis_test"
TEST_DB_URL = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', '')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{TEST_DB_NAME}"

def terminate_database_connections(engine, database_name):
    """Terminate all connections to a database."""
    with engine.connect() as conn:
        conn.execute(text("""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = :database_name
            AND pid != pg_backend_pid()
        """), {"database_name": database_name})
        conn.execute(text("COMMIT"))

@pytest.fixture(scope="session")
def test_db():
    """Create a test database."""
    default_db_url = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', '')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/postgres"
    
    # Connect to default database to create test database
    engine = create_engine(default_db_url)
    
    # Terminate existing connections and drop test database
    terminate_database_connections(engine, TEST_DB_NAME)
    
    with engine.connect() as conn:
        conn.execute(text("COMMIT"))
        conn.execute(text(f"DROP DATABASE IF EXISTS {TEST_DB_NAME}"))
        conn.execute(text(f"CREATE DATABASE {TEST_DB_NAME}"))
    
    # Create test database engine
    test_engine = create_engine(TEST_DB_URL)
    
    # Create schemas
    with test_engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS staging"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS dwh"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS raw_files"))
        conn.execute(text("COMMIT"))
    
    # Create all tables
    Base.metadata.create_all(test_engine)
    
    # Create a session factory
    Session = sessionmaker(bind=test_engine)
    
    # Store the session factory in the engine for use by other fixtures
    test_engine.Session = Session
    
    yield test_engine
    
    # Drop test database after all tests
    terminate_database_connections(engine, TEST_DB_NAME)
    with engine.connect() as conn:
        conn.execute(text("COMMIT"))
        conn.execute(text(f"DROP DATABASE IF EXISTS {TEST_DB_NAME}"))

@pytest.fixture
def db_session(test_db):
    """Create a new database session for a test."""
    session = test_db.Session()
    
    yield session
    
    # Clean up after test
    session.rollback()
    for table in reversed(Base.metadata.sorted_tables):
        session.execute(table.delete())
    session.commit()
    session.close()

@pytest.fixture
def sample_courts_data():
    """Create a sample DataFrame with tennis courts data."""
    return pd.DataFrame([
        {
            'court_id': '1',
            'park_name': 'Test Park 1',
            'park_details': 'Test details 1',
            'address': '123 Test St',
            'phone': '123-456-7890',
            'email': 'test1@example.com',
            'hours': '9am-5pm',
            'website': 'http://test1.com',
            'num_courts': 2,
            'lat': 40.7128,
            'lon': -74.0060,
            'court_type': 'Hard'
        },
        {
            'court_id': '2',
            'park_name': 'Test Park 2',
            'park_details': 'Test details 2',
            'address': '456 Test Ave',
            'phone': '098-765-4321',
            'email': 'test2@example.com',
            'hours': '8am-8pm',
            'website': 'http://test2.com',
            'num_courts': 4,
            'lat': 40.7589,
            'lon': -73.9851,
            'court_type': 'Clay'
        }
    ])

@pytest.fixture
def sample_availability_data():
    """Create a sample DataFrame with court availability data."""
    return pd.DataFrame([
        {
            'court_id': '1',
            'date': '2025-08-01',
            'time': '9:00 a.m.',
            'court': 'Court 1',
            'status': 'Reserve this time',
            'reservation_link': 'http://test1.com/reserve/1'
        },
        {
            'court_id': '1',
            'date': '2025-08-01',
            'time': '10:00 a.m.',
            'court': 'Court 1',
            'status': 'Not available',
            'reservation_link': None
        },
        {
            'court_id': '2',
            'date': '2025-08-01',
            'time': '2:00 p.m.',
            'court': 'Court 2',
            'status': 'Reserve this time',
            'reservation_link': 'http://test2.com/reserve/1'
        }
    ])

@pytest.fixture
def sample_csv_files(sample_courts_data, sample_availability_data):
    """Create temporary CSV files with sample data."""
    with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as courts_file:
        sample_courts_data.to_csv(courts_file.name, index=False)
        courts_path = courts_file.name

    with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as avail_file:
        sample_availability_data.to_csv(avail_file.name, index=False)
        avail_path = avail_file.name

    yield {'courts': courts_path, 'availability': avail_path}

    # Clean up temporary files
    os.unlink(courts_path)
    os.unlink(avail_path) 