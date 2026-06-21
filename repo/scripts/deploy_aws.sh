#!/bin/bash

# Load environment variables
source .env

# Check AWS CLI installation
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

echo "Starting AWS deployment..."

# Create IAM role for EC2
aws iam create-role \
    --role-name nyc-tennis-ec2-role \
    --assume-role-policy-document '{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "ec2.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }'

# Attach policies to the role
aws iam attach-role-policy \
    --role-name nyc-tennis-ec2-role \
    --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

aws iam attach-role-policy \
    --role-name nyc-tennis-ec2-role \
    --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# Create instance profile and add role to it
aws iam create-instance-profile --instance-profile-name nyc-tennis-profile
aws iam add-role-to-instance-profile \
    --instance-profile-name nyc-tennis-profile \
    --role-name nyc-tennis-ec2-role

# Create security group
aws ec2 create-security-group \
    --group-name nyc-tennis-sg \
    --description "Security group for NYC Tennis application"

# Add inbound rules
aws ec2 authorize-security-group-ingress \
    --group-name nyc-tennis-sg \
    --protocol tcp \
    --port 22 \
    --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
    --group-name nyc-tennis-sg \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
    --group-name nyc-tennis-sg \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0

# Create S3 bucket for static files
aws s3api create-bucket \
    --bucket $S3_BUCKET_NAME \
    --region $AWS_REGION

# Enable S3 bucket for static website hosting
aws s3 website s3://$S3_BUCKET_NAME/ \
    --index-document index.html \
    --error-document 404.html

# Upload static files to S3
npm run build
aws s3 sync ./out s3://$S3_BUCKET_NAME/

# Create RDS instance
aws rds create-db-instance \
    --db-instance-identifier nyc-tennis-db \
    --db-instance-class db.t2.micro \
    --engine postgres \
    --master-username $DB_USER \
    --master-user-password $DB_PASSWORD \
    --allocated-storage 20 \
    --vpc-security-group-ids $VPC_SECURITY_GROUP \
    --availability-zone $AWS_ZONE

# Wait for RDS to be available
echo "Waiting for RDS instance to be available..."
aws rds wait db-instance-available --db-instance-identifier nyc-tennis-db

# Create EC2 instance
aws ec2 run-instances \
    --image-id ami-0c7217cdde317cfec \  # Amazon Linux 2023
    --instance-type t2.micro \
    --key-name nyc-tennis-key \
    --security-groups nyc-tennis-sg \
    --iam-instance-profile Name=nyc-tennis-profile \
    --user-data file://scripts/ec2-setup.sh \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=nyc-tennis-etl}]'

echo "Deployment completed! Please check AWS Console for details."

# Output important information
echo "
Important Next Steps:
1. Update your .env file with the new RDS endpoint
2. SSH into the EC2 instance to verify the setup:
   ssh -i nyc-tennis-key.pem ec2-user@<EC2-IP>
3. Check CloudWatch logs in AWS Console
4. Monitor the first ETL run in about an hour
" 