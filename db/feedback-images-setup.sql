-- FEEDBACK IMAGES FEATURE - DATABASE SETUP
-- Run this in Supabase SQL Editor to add image support to feedback system

-- Step 1: Add image columns to feedback table for single image (simple approach)
ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS image_aws_key TEXT,
ADD COLUMN IF NOT EXISTS image_thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS image_uploaded_at TIMESTAMPTZ;

-- Step 2: Create feedback_images table for multiple images per feedback
CREATE TABLE IF NOT EXISTS feedback_images (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  aws_url TEXT NOT NULL,
  aws_key TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  file_size INTEGER,
  mime_type TEXT,
  upload_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Add indexes for performance
CREATE INDEX IF NOT EXISTS feedback_images_feedback_id_idx ON feedback_images(feedback_id);
CREATE INDEX IF NOT EXISTS feedback_images_upload_order_idx ON feedback_images(upload_order);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback(created_at);

-- Step 4: Grant permissions (adjust based on your RLS policies)
GRANT ALL ON feedback_images TO authenticated;
GRANT SELECT ON feedback_images TO anon;

-- Step 5: Verify the setup
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'feedback_images'
ORDER BY ordinal_position;