#!/bin/bash

# Load environment variables
source .env

# Check AWS CLI installation
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Get EC2 instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=nyc-tennis-etl" \
    --query "Reservations[].Instances[?State.Name=='running'][].InstanceId" \
    --output text)

if [ -z "$INSTANCE_ID" ]; then
    echo "No running ETL instance found!"
    exit 1
fi

echo "ETL Instance Status:"
echo "==================="
aws ec2 describe-instance-status \
    --instance-ids $INSTANCE_ID \
    --query "InstanceStatuses[0].{InstanceStatus:InstanceStatus.Status,SystemStatus:SystemStatus.Status}" \
    --output table

echo -e "\nRecent CloudWatch Logs:"
echo "====================="
# Get the most recent log streams
aws logs get-log-events \
    --log-group-name "/nyc-tennis/etl" \
    --log-stream-name $(aws logs describe-log-streams \
        --log-group-name "/nyc-tennis/etl" \
        --order-by LastEventTime \
        --descending \
        --limit 1 \
        --query "logStreams[0].logStreamName" \
        --output text) \
    --limit 10 \
    --query "events[*].[timestamp,message]" \
    --output text

echo -e "\nCron Job Status:"
echo "================="
# Get the last cron job execution status
aws logs get-log-events \
    --log-group-name "/nyc-tennis/cron" \
    --log-stream-name $(aws logs describe-log-streams \
        --log-group-name "/nyc-tennis/cron" \
        --order-by LastEventTime \
        --descending \
        --limit 1 \
        --query "logStreams[0].logStreamName" \
        --output text) \
    --limit 5 \
    --query "events[*].[timestamp,message]" \
    --output text 