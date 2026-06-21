#!/bin/bash

# Get absolute paths
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
SCHEDULE_SCRIPT="$SCRIPT_DIR/schedule_availability_etl.sh"

# Make the schedule script executable
chmod +x "$SCHEDULE_SCRIPT"

# Create a temporary file for the new crontab entry
TEMP_CRON=$(mktemp)

# Export current crontab
crontab -l > "$TEMP_CRON" 2>/dev/null

# Check if the ETL job is already in crontab
if ! grep -q "$SCHEDULE_SCRIPT" "$TEMP_CRON"; then
    # Add the new cron job to run every hour
    echo "0 * * * * $SCHEDULE_SCRIPT" >> "$TEMP_CRON"
    
    # Install the new crontab
    crontab "$TEMP_CRON"
    echo "ETL scheduler has been set up to run every hour"
else
    echo "ETL scheduler is already set up in crontab"
fi

# Clean up
rm "$TEMP_CRON"

# Verify the crontab entry
echo "Current crontab entries:"
crontab -l 