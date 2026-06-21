from sqlalchemy import Column, Integer, String, DateTime, Text, DECIMAL, ForeignKey, UniqueConstraint, Date, Boolean
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import pytz

Base = declarative_base()

def get_et_time():
    """Get current time in Eastern Time"""
    et = pytz.timezone('America/New_York')
    return datetime.now(et)

class FileRegistry(Base):
    __tablename__ = 'file_registry'
    __table_args__ = {'schema': 'raw_files'}

    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    filepath = Column(String(1000), nullable=False)
    load_timestamp = Column(DateTime(timezone=True), default=get_et_time)
    file_hash = Column(String(64), nullable=False)
    status = Column(String(50), nullable=False)

class DwhTennisCourt(Base):
    __tablename__ = 'tennis_courts'
    __table_args__ = {'schema': 'dwh'}

    id = Column(Integer, primary_key=True)
    park_id = Column(String(50), nullable=False, unique=True)
    park_name = Column(String(500), nullable=False)
    park_details = Column(Text, nullable=True)
    address = Column(String(500), nullable=True)
    phone = Column(String(500), nullable=True)
    email = Column(String(500), nullable=True)
    hours = Column(String(500), nullable=True)
    website = Column(String(500), nullable=True)
    num_courts = Column(Integer, nullable=True)
    lat = Column(DECIMAL(10, 8), nullable=True)
    lon = Column(DECIMAL(11, 8), nullable=True)
    court_type = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_et_time)

class StagingTennisCourt(Base):
    __tablename__ = 'tennis_courts'
    __table_args__ = {'schema': 'staging'}

    id = Column(Integer, primary_key=True)
    park_id = Column(String(50), nullable=False)
    park_name = Column(String(500), nullable=False)
    park_details = Column(Text, nullable=True)
    address = Column(String(500), nullable=True)
    phone = Column(String(500), nullable=True)
    email = Column(String(500), nullable=True)
    hours = Column(String(500), nullable=True)
    website = Column(String(500), nullable=True)
    num_courts = Column(Integer, nullable=True)
    lat = Column(DECIMAL(10, 8), nullable=True)
    lon = Column(DECIMAL(11, 8), nullable=True)
    court_type = Column(String(50), nullable=True)

class DwhCourtAvailability(Base):
    __tablename__ = 'court_availability'
    __table_args__ = (
        UniqueConstraint('park_id', 'court_id', 'date', 'time', name='uix_court_availability'),
        {'schema': 'dwh'}
    )

    id = Column(Integer, primary_key=True)
    park_id = Column(String(50), ForeignKey('dwh.tennis_courts.park_id'), nullable=False)
    court_id = Column(String(50), nullable=False)
    date = Column(Date, nullable=False)  # Changed to Date type
    time = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False)
    reservation_link = Column(String(500), nullable=True)
    is_available = Column(Boolean, nullable=False, default=False)
    last_updated = Column(DateTime(timezone=True), default=get_et_time)

class StagingCourtAvailability(Base):
    __tablename__ = 'court_availability'
    __table_args__ = {'schema': 'staging'}

    id = Column(Integer, primary_key=True)
    park_id = Column(String(50), ForeignKey('dwh.tennis_courts.park_id'), nullable=False)
    court_id = Column(String(50), nullable=False)
    date = Column(Date, nullable=False)  # Changed to Date type
    time = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False)
    reservation_link = Column(String(500), nullable=True)
    is_available = Column(Boolean, nullable=False, default=False)
    file_id = Column(Integer, ForeignKey('raw_files.file_registry.id'), nullable=False) 