# AWS S3 Bucket Configuration for Feedback Images

## Problem
Images are uploaded to S3 but return 403 Forbidden when trying to view them.

## Required AWS S3 Settings

### 1. Bucket Policy
Go to your S3 bucket → Permissions → Bucket Policy and add:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::newfurniture-ar-assets/feedback-images/*"
        },
        {
            "Sid": "PublicReadModels",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::newfurniture-ar-assets/furniture-models/*"
        }
    ]
}
```

### 2. CORS Configuration
Go to your S3 bucket → Permissions → CORS and add:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedOrigins": [
            "https://newfurniture.live",
            "https://*.vercel.app",
            "http://localhost:3000"
        ],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
    }
]
```

### 3. Block Public Access Settings
Go to your S3 bucket → Permissions → Block public access settings:

- Block all public access: **OFF**
- Block public access to buckets and objects granted through new access control lists (ACLs): **OFF**
- Block public access to buckets and objects granted through any access control lists (ACLs): **OFF**
- Block public access to buckets and objects granted through new public bucket or access point policies: **OFF**
- Block public and cross-account access to buckets and objects through any public bucket or access point policies: **OFF**

⚠️ **Important:** Only turn off blocking for the specific bucket, not for your entire AWS account.

### 4. Object Ownership
Go to your S3 bucket → Permissions → Object Ownership:

- Select: **ACLs enabled**
- Object ownership: **Bucket owner preferred**

## Testing

After configuring, test by:
1. Uploading a new feedback image
2. Copying the URL from the console logs
3. Opening the URL directly in a browser
4. It should display the image, not return 403 Forbidden

## Alternative: CloudFront CDN (Optional but Recommended)

If you want better performance and caching, create a CloudFront distribution:
1. Create CloudFront distribution with S3 as origin
2. Use the CloudFront URL instead of direct S3 URLs
3. This also helps with CORS issues

## Quick Fix for Existing Images

After fixing bucket settings, run:
```bash
npm run fix-s3-permissions
```

This updates ACL for all existing images to public-read.