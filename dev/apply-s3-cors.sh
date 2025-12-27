#!/bin/bash

# Apply CORS configuration to S3 bucket for direct browser uploads
# This fixes the ERR_FAILED error when uploading large files

BUCKET_NAME="newfurniture-ar-assets"
REGION="us-east-1"

echo "🔧 Applying CORS configuration to S3 bucket: $BUCKET_NAME"

aws s3api put-bucket-cors \
    --bucket $BUCKET_NAME \
    --cors-configuration file://s3-cors-config.json \
    --region $REGION

if [ $? -eq 0 ]; then
    echo "✅ CORS configuration applied successfully!"
    echo "📝 Verifying CORS settings..."

    aws s3api get-bucket-cors \
        --bucket $BUCKET_NAME \
        --region $REGION
else
    echo "❌ Failed to apply CORS configuration"
    echo "Make sure you have AWS CLI configured with proper credentials"
fi