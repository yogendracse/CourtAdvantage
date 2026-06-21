#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Create logs directory if it doesn't exist
LOGS_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOGS_DIR"

# Set log file with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOGS_DIR/etl_run_$TIMESTAMP.log"

# Redirect all output to log file
exec 1> >(tee -a "$LOG_FILE")
exec 2>&1

echo "Starting ETL run at $(date)"

# Activate virtual environment if it exists
if [ -d "$PROJECT_ROOT/venv" ]; then
    source "$PROJECT_ROOT/venv/bin/activate"
    echo "Virtual environment activated"
fi

# Run the ETL process
cd "$PROJECT_ROOT"
echo "Running ETL process..."
python -m src.etl.run_availability_etl

# Capture the exit status
ETL_STATUS=$?

# Deactivate virtual environment if it was activated
if [ -n "$VIRTUAL_ENV" ]; then
    deactivate
    echo "Virtual environment deactivated"
fi

# Clean up old log files (keep last 7 days)
find "$LOGS_DIR" -name "etl_run_*.log" -type f -mtime +7 -delete

echo "ETL run completed at $(date) with status $ETL_STATUS"
exit $ETL_STATUS 