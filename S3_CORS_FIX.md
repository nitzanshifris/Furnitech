# Fix AWS S3 CORS for AR Models

## The Problem
Models ARE migrated to AWS but browser blocks access due to CORS policy.

## Quick Fix

1. **Go to AWS S3 Console**:
   https://s3.console.aws.amazon.com/s3/buckets/newfurniture-ar-assets

2. **Click on "Permissions" tab**

3. **Scroll to "Cross-origin resource sharing (CORS)"**

4. **Click "Edit" and paste this:**

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedOrigins": [
            "https://newfurniture.live",
            "https://*.newfurniture.live",
            "https://*.vercel.app",
            "http://localhost:*"
        ],
        "ExposeHeaders": [
            "Content-Length",
            "Content-Type",
            "ETag"
        ],
        "MaxAgeSeconds": 3600
    }
]
```

5. **Click "Save changes"**

## Alternative: Allow ALL origins (less secure but simpler)

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["*"],
        "MaxAgeSeconds": 3600
    }
]
```

## Test After Fixing

1. Hard refresh the page (Cmd+Shift+R)
2. Check Network tab - should load from S3 without CORS errors
3. Model should appear in 3D viewer

## Current Status
✅ Migration code works
✅ API returns AWS URLs
✅ Models are stored in S3
❌ CORS blocks access from browser
⏳ Need to fix S3 bucket permissions