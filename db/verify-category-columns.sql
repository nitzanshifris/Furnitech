-- ========================================
-- VERIFY CATEGORY COLUMNS WERE ADDED
-- Run this in Supabase SQL Editor
-- ========================================

-- 1. Check if category columns exist in models table
SELECT
    column_name,
    data_type,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'models'
AND column_name IN ('product_category', 'product_subcategory');

-- 2. Check if index was created
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'models'
AND indexname IN ('idx_models_category', 'idx_models_customer_category');

-- 3. Sample check - see current values
SELECT
    id,
    title,
    customer_name,
    category_slug,  -- old auto-generated
    product_category,  -- new explicit
    product_subcategory  -- new explicit
FROM models
LIMIT 10;

-- 4. Count how many products have categories set
SELECT
    COUNT(*) as total_products,
    COUNT(product_category) as with_category,
    COUNT(*) - COUNT(product_category) as without_category
FROM models;

-- 5. If columns don't exist, run these:
-- ALTER TABLE models ADD COLUMN IF NOT EXISTS product_category VARCHAR(50);
-- ALTER TABLE models ADD COLUMN IF NOT EXISTS product_subcategory VARCHAR(50);
-- CREATE INDEX IF NOT EXISTS idx_models_category ON models(product_category);
-- CREATE INDEX IF NOT EXISTS idx_models_customer_category ON models(customer_id, product_category);