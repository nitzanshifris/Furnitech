-- =====================================================
-- SAFE CATEGORY SYSTEM SETUP - NON-DESTRUCTIVE VERSION
-- This version doesn't drop anything, only adds what's missing
-- =====================================================

-- 1. Add product_category column if it doesn't exist (SAFE - only adds if missing)
ALTER TABLE models ADD COLUMN IF NOT EXISTS product_category VARCHAR(100);

-- 2. Create the customer_categories table if it doesn't exist (SAFE - only creates if missing)
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

-- 3. Create indexes for better performance (SAFE - only creates if missing)
CREATE INDEX IF NOT EXISTS idx_models_category ON models(product_category);
CREATE INDEX IF NOT EXISTS idx_models_customer_category ON models(customer_id, product_category);
CREATE INDEX IF NOT EXISTS idx_customer_categories_customer ON customer_categories(customer_id);

-- 4. Grant permissions (SAFE - granting permissions doesn't hurt)
GRANT ALL ON customer_categories TO authenticated;
GRANT SELECT ON customer_categories TO anon;

-- 5. Show what we have now (just informational)
SELECT 'Setup Complete - Current Status:' as status;

SELECT
    'Models table has product_category column' as check_item,
    EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'models'
        AND column_name = 'product_category'
    ) as status;

SELECT
    'Customer_categories table exists' as check_item,
    EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'customer_categories'
    ) as status;

-- =====================================================
-- OPTIONAL DESTRUCTIVE OPERATIONS (RUN SEPARATELY IF NEEDED)
-- Only run these after confirming they won't delete important data
-- =====================================================

-- OPTIONAL: Remove product_subcategory column if you're sure it's not needed
-- First check if it has data:
-- SELECT COUNT(*) FROM models WHERE product_subcategory IS NOT NULL;
-- If it's safe to remove:
-- ALTER TABLE models DROP COLUMN IF EXISTS product_subcategory;

-- OPTIONAL: Remove customer_subcategories table if you're sure it's not needed
-- First check if it exists and has data:
-- SELECT COUNT(*) FROM customer_subcategories;
-- If it's safe to remove:
-- DROP TABLE IF EXISTS customer_subcategories CASCADE;