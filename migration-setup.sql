-- ========================================
-- AWS MIGRATION SETUP SQL
-- Run this in Supabase SQL Editor
-- ========================================

-- 1. ADD MIGRATION COLUMNS TO MODELS TABLE
ALTER TABLE models ADD COLUMN IF NOT EXISTS storage_location VARCHAR(20) DEFAULT 'cloudinary';
ALTER TABLE models ADD COLUMN IF NOT EXISTS aws_url TEXT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS aws_filename TEXT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP;
ALTER TABLE models ADD COLUMN IF NOT EXISTS migration_error TEXT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS migration_verified BOOLEAN DEFAULT false;

-- 2. ADD MIGRATION COLUMNS TO MODEL_VARIANTS TABLE (if you have variants)
ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS storage_location VARCHAR(20) DEFAULT 'cloudinary';
ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS aws_url TEXT;
ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP;

-- 3. CREATE MIGRATION TRACKING TABLE
CREATE TABLE IF NOT EXISTS migration_logs (
  id SERIAL PRIMARY KEY,
  model_id TEXT,
  action VARCHAR(50),
  status VARCHAR(20),
  details JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. CREATE INDEXES FOR BETTER PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_models_storage_location ON models(storage_location);
CREATE INDEX IF NOT EXISTS idx_models_migrated_at ON models(migrated_at);
CREATE INDEX IF NOT EXISTS idx_migration_logs_model_id ON migration_logs(model_id);

-- 5. VERIFY IT WORKED - This should return your models with new columns
SELECT
  id,
  title,
  storage_location,
  aws_url,
  migrated_at
FROM models
LIMIT 5;

-- 6. CHECK MIGRATION READINESS
SELECT
  COUNT(*) as total_models,
  COUNT(CASE WHEN storage_location = 'cloudinary' THEN 1 END) as on_cloudinary,
  COUNT(CASE WHEN storage_location = 'aws' THEN 1 END) as on_aws,
  COUNT(CASE WHEN model_url IS NOT NULL OR cloudinary_url IS NOT NULL THEN 1 END) as have_urls
FROM models;