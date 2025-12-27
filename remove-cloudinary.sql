-- CLOUDINARY REMOVAL SQL SCRIPT
-- Run this in Supabase SQL Editor to fully remove Cloudinary from your database

-- Step 1: Update all records to ensure AWS URLs are populated where Cloudinary URLs exist
UPDATE models
SET
  aws_url = COALESCE(aws_url, cloudinary_url),
  aws_filename = COALESCE(aws_filename, filename),
  storage_location = 'aws'
WHERE cloudinary_url IS NOT NULL AND aws_url IS NULL;

UPDATE model_variants
SET
  aws_url = COALESCE(aws_url, cloudinary_url),
  storage_location = 'aws'
WHERE cloudinary_url IS NOT NULL AND aws_url IS NULL;

-- Step 2: Verify no models are using Cloudinary anymore
SELECT COUNT(*) as cloudinary_models_count
FROM models
WHERE storage_location = 'cloudinary' OR storage_location IS NULL;

SELECT COUNT(*) as cloudinary_variants_count
FROM model_variants
WHERE storage_location = 'cloudinary' OR storage_location IS NULL;

-- Step 3: Drop Cloudinary columns (ONLY RUN AFTER VERIFICATION!)
-- Uncomment these lines after confirming all data is migrated to AWS
/*
ALTER TABLE models
DROP COLUMN IF EXISTS cloudinary_url,
DROP COLUMN IF EXISTS cloudinary_public_id;

ALTER TABLE model_variants
DROP COLUMN IF EXISTS cloudinary_url,
DROP COLUMN IF EXISTS cloudinary_public_id;
*/

-- Step 4: Set default storage location to AWS
ALTER TABLE models
ALTER COLUMN storage_location SET DEFAULT 'aws';

ALTER TABLE model_variants
ALTER COLUMN storage_location SET DEFAULT 'aws';

-- Step 5: Check final status
SELECT
  'models' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN storage_location = 'aws' THEN 1 END) as aws_records,
  COUNT(CASE WHEN aws_url IS NOT NULL THEN 1 END) as has_aws_url
FROM models
UNION ALL
SELECT
  'model_variants' as table_name,
  COUNT(*) as total_records,
  COUNT(CASE WHEN storage_location = 'aws' THEN 1 END) as aws_records,
  COUNT(CASE WHEN aws_url IS NOT NULL THEN 1 END) as has_aws_url
FROM model_variants;