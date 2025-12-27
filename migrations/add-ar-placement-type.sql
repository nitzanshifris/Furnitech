-- Add AR placement type support for floor vs wall placement
-- This migration adds ar_placement column to models table

-- Add ar_placement column to models table
ALTER TABLE models
ADD COLUMN IF NOT EXISTS ar_placement VARCHAR(10) DEFAULT 'floor' CHECK (ar_placement IN ('floor', 'wall'));

-- Add comment explaining the column
COMMENT ON COLUMN models.ar_placement IS 'Determines AR surface anchoring: floor (horizontal surfaces) or wall (vertical surfaces)';

-- Update existing records based on likely placement type
-- Wallpaper and wall-related items should use wall placement
UPDATE models
SET ar_placement = 'wall'
WHERE LOWER(title) LIKE '%wallpaper%'
   OR LOWER(title) LIKE '%wall%paper%'
   OR LOWER(title) LIKE '%טפט%'
   OR LOWER(description) LIKE '%wallpaper%'
   OR metadata->>'type' = 'wallpaper';

-- Optional: Update specific categories if you have them
UPDATE models
SET ar_placement = 'wall'
WHERE category = 'wallpapers'
   OR category = 'wall-art'
   OR category = 'mirrors';

-- All other furniture remains floor placement (default)