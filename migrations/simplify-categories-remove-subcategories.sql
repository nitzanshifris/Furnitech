-- ========================================
-- SIMPLIFY CATEGORY SYSTEM - REMOVE SUBCATEGORIES
-- ========================================

-- 1. Drop subcategory column from models table
ALTER TABLE models DROP COLUMN IF EXISTS product_subcategory;

-- 2. Drop the entire subcategories table (we don't need it)
DROP TABLE IF EXISTS customer_subcategories CASCADE;

-- 3. Ensure the customer_categories table is clean and simple
-- It should already exist from previous migration, but let's ensure it's correct
CREATE TABLE IF NOT EXISTS customer_categories (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR(100) NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    category_slug VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(customer_id, category_slug)
);

-- 4. Verify the simplified structure
SELECT
    'Categories table' as table_name,
    COUNT(*) as record_count
FROM customer_categories;

SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'models'
AND column_name LIKE '%category%';