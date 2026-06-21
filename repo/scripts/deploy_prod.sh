#!/bin/bash

# Exit on any error
set -e

# Load environment variables
source .env

# Create backup
echo "Creating backup of existing database..."
pg_dump nyc_tennis > pre_migration_backup_$(date +%Y%m%d_%H%M%S).sql

# Check if database exists, create if not
psql -h $DB_HOST -U $DB_USER -tc "SELECT 1 FROM pg_database WHERE datname = 'nyc_tennis_prod'" | grep -q 1 || psql -h $DB_HOST -U $DB_USER -c "CREATE DATABASE nyc_tennis_prod"

# Run database migrations
echo "Running database migrations..."
DB_NAME=nyc_tennis_prod alembic upgrade head

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt
npm install

# Build application
echo "Building application..."
npm run build

# Run initial data load
echo "Loading initial data..."
DB_NAME=nyc_tennis_prod python -m src.etl.run_etl both

# Set up cron jobs
echo "Setting up cron jobs..."
(crontab -l 2>/dev/null; echo "*/30 * * * * cd $(pwd) && DB_NAME=nyc_tennis_prod python -m src.etl.run_availability_etl") | crontab -
(crontab -l 2>/dev/null; echo "0 0 * * * cd $(pwd) && ./scripts/cleanup_prod.sh") | crontab -

# Start application
echo "Starting application..."
npm run start

echo "Production deployment completed successfully!" 