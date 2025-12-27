-- =====================================================
-- COMPLETE CATEGORY SYSTEM SETUP FOR SUPABASE
-- Run this SQL in your Supabase SQL editor
-- =====================================================

-- 1. First, add the product_category column to models table if it doesn't exist
ALTER TABLE models ADD COLUMN IF NOT EXISTS product_category VARCHAR(100);

-- 2. Drop the subcategory column (we're not using it anymore)
ALTER TABLE models DROP COLUMN IF EXISTS product_subcategory;

-- 3. Create the customer_categories table for customer-specific categories
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

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_models_category ON models(product_category);
CREATE INDEX IF NOT EXISTS idx_models_customer_category ON models(customer_id, product_category);
CREATE INDEX IF NOT EXISTS idx_customer_categories_customer ON customer_categories(customer_id);

-- 5. Drop the customer_subcategories table if it exists (we don't need it)
DROP TABLE IF EXISTS customer_subcategories CASCADE;

-- 6. Insert some default categories for existing customers (optional)
-- This will add default categories for each unique customer in your models table
-- You can skip this if you want customers to define their own categories
INSERT INTO customer_categories (customer_id, category_name, category_slug, display_order)
SELECT DISTINCT
    m.customer_id,
    cat.category_name,
    cat.category_slug,
    cat.display_order
FROM models m
CROSS JOIN (
    VALUES
        ('Living Room', 'living-room', 1),
        ('Bedroom', 'bedroom', 2),
        ('Dining Room', 'dining-room', 3),
        ('Office', 'office', 4),
        ('Outdoor', 'outdoor', 5)
) AS cat(category_name, category_slug, display_order)
WHERE m.customer_id IS NOT NULL
  AND m.customer_id != 'unassigned'
  AND NOT EXISTS (
    SELECT 1 FROM customer_categories cc
    WHERE cc.customer_id = m.customer_id
    AND cc.category_slug = cat.category_slug
  );

-- 7. Grant appropriate permissions for the customer_categories table
-- (Supabase should handle this automatically, but including for completeness)
GRANT ALL ON customer_categories TO authenticated;
GRANT SELECT ON customer_categories TO anon;

-- 8. Verify the setup
DO $$
BEGIN
    RAISE NOTICE '=== Category System Setup Complete ===';

    -- Check models table
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'models'
        AND column_name = 'product_category'
    ) THEN
        RAISE NOTICE '✅ product_category column exists in models table';
    ELSE
        RAISE NOTICE '❌ product_category column missing in models table';
    END IF;

    -- Check customer_categories table
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'customer_categories'
    ) THEN
        RAISE NOTICE '✅ customer_categories table exists';
    ELSE
        RAISE NOTICE '❌ customer_categories table missing';
    END IF;

    -- Check if subcategory column was removed
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'models'
        AND column_name = 'product_subcategory'
    ) THEN
        RAISE NOTICE '✅ product_subcategory column successfully removed';
    ELSE
        RAISE NOTICE '⚠️ product_subcategory column still exists (not critical)';
    END IF;
END $$;

-- 9. Show summary
SELECT 'Models Table Columns' as check_type,
       string_agg(column_name, ', ') as columns
FROM information_schema.columns
WHERE table_name = 'models'
  AND column_name LIKE '%category%'
UNION ALL
SELECT 'Customer Categories Count' as check_type,
       COUNT(*)::text as columns
FROM customer_categories
UNION ALL
SELECT 'Unique Customers with Categories' as check_type,
       COUNT(DISTINCT customer_id)::text as columns
FROM customer_categories;