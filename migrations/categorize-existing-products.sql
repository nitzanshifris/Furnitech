-- ===============================================
-- MIGRATION: Categorize Existing Products
-- Run this after adding product_category columns
-- ===============================================

-- This script will attempt to categorize existing products based on their titles
-- Review and adjust categories as needed after running

-- 1. First, ensure the columns exist
ALTER TABLE models ADD COLUMN IF NOT EXISTS product_category VARCHAR(50);
ALTER TABLE models ADD COLUMN IF NOT EXISTS product_subcategory VARCHAR(50);

-- 2. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_models_category ON models(product_category);
CREATE INDEX IF NOT EXISTS idx_models_customer_category ON models(customer_id, product_category);

-- 3. Auto-categorize based on title keywords
-- Living Room items
UPDATE models
SET product_category = 'living-room',
    product_subcategory = 'sofas'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%sofa%'
    OR LOWER(title) LIKE '%couch%'
    OR LOWER(title) LIKE '%sectional%');

UPDATE models
SET product_category = 'living-room',
    product_subcategory = 'armchairs'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%armchair%'
    OR LOWER(title) LIKE '%recliner%'
    OR LOWER(title) LIKE '%lounge chair%');

UPDATE models
SET product_category = 'living-room',
    product_subcategory = 'coffee-tables'
WHERE product_category IS NULL
  AND LOWER(title) LIKE '%coffee table%';

UPDATE models
SET product_category = 'living-room',
    product_subcategory = 'tv-units'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%tv%'
    OR LOWER(title) LIKE '%entertainment%'
    OR LOWER(title) LIKE '%media console%');

-- Bedroom items
UPDATE models
SET product_category = 'bedroom',
    product_subcategory = 'beds'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%bed%'
    AND LOWER(title) NOT LIKE '%bedside%'
    AND LOWER(title) NOT LIKE '%bedroom%');

UPDATE models
SET product_category = 'bedroom',
    product_subcategory = 'nightstands'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%nightstand%'
    OR LOWER(title) LIKE '%bedside%');

UPDATE models
SET product_category = 'bedroom',
    product_subcategory = 'dressers'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%dresser%'
    OR LOWER(title) LIKE '%chest of drawers%');

UPDATE models
SET product_category = 'bedroom',
    product_subcategory = 'wardrobes'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%wardrobe%'
    OR LOWER(title) LIKE '%closet%'
    OR LOWER(title) LIKE '%armoire%');

-- Dining Room items
UPDATE models
SET product_category = 'dining-room',
    product_subcategory = 'dining-tables'
WHERE product_category IS NULL
  AND LOWER(title) LIKE '%dining table%';

UPDATE models
SET product_category = 'dining-room',
    product_subcategory = 'dining-chairs'
WHERE product_category IS NULL
  AND LOWER(title) LIKE '%dining chair%';

UPDATE models
SET product_category = 'dining-room',
    product_subcategory = 'bar-stools'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%bar stool%'
    OR LOWER(title) LIKE '%counter stool%');

-- Office items
UPDATE models
SET product_category = 'office',
    product_subcategory = 'desks'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%desk%'
    AND LOWER(title) NOT LIKE '%desktop%');

UPDATE models
SET product_category = 'office',
    product_subcategory = 'office-chairs'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%office chair%'
    OR LOWER(title) LIKE '%task chair%'
    OR LOWER(title) LIKE '%executive chair%');

UPDATE models
SET product_category = 'office',
    product_subcategory = 'bookcases'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%bookcase%'
    OR LOWER(title) LIKE '%bookshelf%'
    OR LOWER(title) LIKE '%shelving%');

-- Outdoor items
UPDATE models
SET product_category = 'outdoor'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%outdoor%'
    OR LOWER(title) LIKE '%patio%'
    OR LOWER(title) LIKE '%garden%');

-- Storage items
UPDATE models
SET product_category = 'storage',
    product_subcategory = 'cabinets'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%cabinet%'
    OR LOWER(title) LIKE '%cupboard%');

UPDATE models
SET product_category = 'storage',
    product_subcategory = 'shelving-units'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%shelf%'
    OR LOWER(title) LIKE '%shelves%'
    OR LOWER(title) LIKE '%rack%');

-- Generic chair categorization
UPDATE models
SET product_category = 'living-room',
    product_subcategory = 'armchairs'
WHERE product_category IS NULL
  AND LOWER(title) LIKE '%chair%';

-- Generic table categorization
UPDATE models
SET product_category = 'living-room',
    product_subcategory = 'side-tables'
WHERE product_category IS NULL
  AND LOWER(title) LIKE '%table%';

-- Bathroom items
UPDATE models
SET product_category = 'bathroom'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%bathroom%'
    OR LOWER(title) LIKE '%vanity%'
    OR LOWER(title) LIKE '%toilet%');

-- Kitchen items
UPDATE models
SET product_category = 'kitchen'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%kitchen%'
    OR LOWER(title) LIKE '%pantry%');

-- Kids items
UPDATE models
SET product_category = 'kids'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%kids%'
    OR LOWER(title) LIKE '%child%'
    OR LOWER(title) LIKE '%toy%'
    OR LOWER(title) LIKE '%crib%'
    OR LOWER(title) LIKE '%bunk%');

-- Decor items
UPDATE models
SET product_category = 'decor'
WHERE product_category IS NULL
  AND (LOWER(title) LIKE '%mirror%'
    OR LOWER(title) LIKE '%lamp%'
    OR LOWER(title) LIKE '%rug%'
    OR LOWER(title) LIKE '%decor%'
    OR LOWER(title) LIKE '%vase%'
    OR LOWER(title) LIKE '%art%'
    OR LOWER(title) LIKE '%frame%');

-- 4. Report on categorization results
SELECT
    'Categorization Summary' as report,
    COUNT(*) as total_products,
    COUNT(product_category) as categorized,
    COUNT(*) - COUNT(product_category) as uncategorized
FROM models;

-- 5. Show breakdown by category
SELECT
    COALESCE(product_category, 'Uncategorized') as category,
    COUNT(*) as product_count
FROM models
GROUP BY product_category
ORDER BY product_count DESC;

-- 6. Show uncategorized products (for manual review)
SELECT
    id,
    title,
    customer_name,
    upload_date
FROM models
WHERE product_category IS NULL
ORDER BY upload_date DESC
LIMIT 50;

-- Note: After running this migration, you can manually update any
-- incorrectly categorized products through the admin interface