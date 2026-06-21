#!/bin/bash

# Load environment variables
source .env

# Check Azure CLI installation
if ! command -v az &> /dev/null; then
    echo "Azure CLI is not installed. Please install it first."
    exit 1
fi

# Check Azure login
if ! az account show &> /dev/null; then
    echo "Please login to Azure first using 'az login'"
    exit 1
fi

echo "Starting Azure deployment..."

# Create resource group
az group create \
    --name nyc-tennis-rg \
    --location eastus

# Create App Service Plan
az appservice plan create \
    --name nyc-tennis-plan \
    --resource-group nyc-tennis-rg \
    --sku B1 \
    --is-linux

# Create Web App for Frontend
az webapp create \
    --name nyc-tennis-web \
    --resource-group nyc-tennis-rg \
    --plan nyc-tennis-plan \
    --runtime "NODE|18-lts"

# Create Web App for Backend API
az webapp create \
    --name nyc-tennis-api \
    --resource-group nyc-tennis-rg \
    --plan nyc-tennis-plan \
    --runtime "PYTHON|3.9"

# Create PostgreSQL database
az postgres server create \
    --name nyc-tennis-db \
    --resource-group nyc-tennis-rg \
    --location eastus \
    --admin-user $DB_USER \
    --admin-password $DB_PASSWORD \
    --sku-name B_Gen5_1 \
    --version 13 \
    --storage-size 32

# Deploy frontend
echo "Deploying frontend..."
npm run build
az webapp deployment source config-zip \
    --resource-group nyc-tennis-rg \
    --name nyc-tennis-web \
    --src ./out/build.zip

# Deploy backend
echo "Deploying backend..."
zip -r backend.zip . -x "node_modules/*" "out/*" ".git/*"
az webapp deployment source config-zip \
    --resource-group nyc-tennis-rg \
    --name nyc-tennis-api \
    --src backend.zip

# Setup WebJob for slot extractor
echo "Setting up WebJob..."
zip -r webjob.zip court_availability_finder.py requirements.txt
az webapp webjob continuous create \
    --resource-group nyc-tennis-rg \
    --name nyc-tennis-api \
    --webjob-name slot-extractor \
    --src webjob.zip

echo "Deployment completed! Please check Azure Portal for details." 