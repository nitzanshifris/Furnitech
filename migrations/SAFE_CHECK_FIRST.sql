-- =====================================================
-- SAFE CHECK SCRIPT - RUN THIS FIRST!
-- This will show you what exists without changing anything
-- =====================================================

-- 1. Check if product_subcategory column exists and has data
SELECT
    'product_subcategory column' as checking,
    EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'models'
        AND column_name = 'product_subcategory'
    ) as exists,
    COUNT(*) FILTER (WHERE product_subcategory IS NOT NULL) as non_null_values,
    COUNT(*) as total_rows
FROM models;

-- 2. Show sample of data in product_subcategory if it exists
SELECT
    id,
    title,
    product_category,
    product_subcategory,
    customer_name
FROM models
WHERE product_subcategory IS NOT NULL
LIMIT 10;

-- 3. Check if customer_subcategories table exists
SELECT
    'customer_subcategories table' as checking,
    EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'customer_subcategories'
    ) as exists;

-- 4. If customer_subcategories exists, check if it has data
SELECT
    'customer_subcategories data' as checking,
    COUNT(*) as row_count
FROM information_schema.tables
WHERE table_name = 'customer_subcategories';

-- 5. Check what columns exist in models table
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'models'
AND column_name LIKE '%category%'
ORDER BY column_name;

-- 6. Check if customer_categories table already exists
SELECT
    'customer_categories table' as checking,
    EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'customer_categories'
    ) as exists;

-- 7. If customer_categories exists, show its structure
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'customer_categories'
ORDER BY ordinal_position;