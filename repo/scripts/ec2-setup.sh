#!/bin/bash

# Update system
yum update -y

# Install Python and pip
yum install -y python3 python3-pip

# Install PostgreSQL client
yum install -y postgresql15

# Install Node.js
curl -sL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs

# Install PM2 for process management
npm install -g pm2

# Create app directory
mkdir -p /opt/nyc-tennis
cd /opt/nyc-tennis

# Clone repository (you'll need to set up deploy keys)
git clone https://github.com/yourusername/nyc-tennis-slots-finder.git .

# Install Python dependencies
pip3 install -r requirements.txt

# Install Node.js dependencies
npm install

# Build the application
npm run build

# Create logs directory with proper permissions
mkdir -p /opt/nyc-tennis/logs
chmod 755 /opt/nyc-tennis/logs

# Set up the ETL scheduler in crontab
(crontab -l 2>/dev/null; echo "0 * * * * /opt/nyc-tennis/scripts/schedule_availability_etl.sh >> /opt/nyc-tennis/logs/cron.log 2>&1") | crontab -

# Make the scheduler script executable
chmod +x /opt/nyc-tennis/scripts/schedule_availability_etl.sh

# Create a log rotation configuration
cat > /etc/logrotate.d/nyc-tennis << EOL
/opt/nyc-tennis/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 ec2-user ec2-user
}
EOL

# Start the application with PM2
pm2 start "npm run start" --name "nyc-tennis-frontend"
pm2 start "python3 src/court_availability_finder.py" --name "nyc-tennis-backend"

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Set up CloudWatch for monitoring
yum install -y amazon-cloudwatch-agent

# Configure CloudWatch agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << EOL
{
    "logs": {
        "logs_collected": {
            "files": {
                "collect_list": [
                    {
                        "file_path": "/opt/nyc-tennis/logs/etl_run_*.log",
                        "log_group_name": "/nyc-tennis/etl",
                        "log_stream_name": "{instance_id}",
                        "timezone": "UTC"
                    },
                    {
                        "file_path": "/opt/nyc-tennis/logs/cron.log",
                        "log_group_name": "/nyc-tennis/cron",
                        "log_stream_name": "{instance_id}",
                        "timezone": "UTC"
                    }
                ]
            }
        }
    },
    "metrics": {
        "metrics_collected": {
            "disk": {
                "measurement": ["used_percent"],
                "metrics_collection_interval": 300,
                "resources": ["/"]
            },
            "mem": {
                "measurement": ["mem_used_percent"],
                "metrics_collection_interval": 300
            }
        }
    }
}
EOL

# Start CloudWatch agent
systemctl start amazon-cloudwatch-agent
systemctl enable amazon-cloudwatch-agent

echo "EC2 setup completed successfully!" 