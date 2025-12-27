-- Add SKU support to AR Furniture Platform
-- Migration: Add SKU columns to models and model_variants tables

-- Add SKU column to models table
ALTER TABLE models ADD COLUMN IF NOT EXISTS sku VARCHAR(50) UNIQUE;

-- Add SKU column to model_variants table
ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS sku VARCHAR(60) UNIQUE;

-- Create indexes for fast SKU lookups
CREATE INDEX IF NOT EXISTS idx_models_sku ON models(sku);
CREATE INDEX IF NOT EXISTS idx_model_variants_sku ON model_variants(sku);

-- Add constraint to ensure SKU format (optional validation)
-- Product SKU format: {CUSTOMER_CODE}-{PRODUCT_CODE}-{ID_SUFFIX}
-- Variant SKU format: {PRODUCT_SKU}-{VARIANT_CODE}

-- Create function to generate customer code from customer_name
CREATE OR REPLACE FUNCTION generate_customer_code(customer_name TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Extract 3-4 character code from customer name
    RETURN UPPER(
        CASE
            WHEN LENGTH(REGEXP_REPLACE(customer_name, '[^A-Za-z]', '', 'g')) >= 4 THEN
                LEFT(REGEXP_REPLACE(customer_name, '[^A-Za-z]', '', 'g'), 4)
            ELSE
                LPAD(REGEXP_REPLACE(customer_name, '[^A-Za-z]', '', 'g'), 3, 'X')
        END
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to generate product code from title
CREATE OR REPLACE FUNCTION generate_product_code(title TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Extract meaningful product code from title
    RETURN UPPER(
        LEFT(
            REGEXP_REPLACE(
                REGEXP_REPLACE(title, '[^A-Za-z0-9 ]', '', 'g'),
                '\s+', '', 'g'
            ),
            8
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to generate variant code from variant_name
CREATE OR REPLACE FUNCTION generate_variant_code(variant_name TEXT, hex_color TEXT DEFAULT NULL)
RETURNS TEXT AS $$
BEGIN
    -- Use variant_name if available, otherwise use color
    IF variant_name IS NOT NULL AND variant_name != '' THEN
        RETURN UPPER(LEFT(REGEXP_REPLACE(variant_name, '[^A-Za-z0-9]', '', 'g'), 6));
    ELSIF hex_color IS NOT NULL THEN
        RETURN UPPER(REPLACE(hex_color, '#', 'C'));
    ELSE
        RETURN 'VAR';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate full product SKU
CREATE OR REPLACE FUNCTION generate_product_sku(customer_name TEXT, title TEXT, model_id TEXT)
RETURNS TEXT AS $$
DECLARE
    customer_code TEXT;
    product_code TEXT;
    id_suffix TEXT;
BEGIN
    customer_code := generate_customer_code(COALESCE(customer_name, 'UNASSIGNED'));
    product_code := generate_product_code(title);
    id_suffix := UPPER(RIGHT(model_id, 4));

    RETURN customer_code || '-' || product_code || '-' || id_suffix;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate full variant SKU
CREATE OR REPLACE FUNCTION generate_variant_sku(product_sku TEXT, variant_name TEXT, hex_color TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    variant_code TEXT;
BEGIN
    variant_code := generate_variant_code(variant_name, hex_color);
    RETURN product_sku || '-' || variant_code;
END;
$$ LANGUAGE plpgsql;

-- Update existing models with generated SKUs (where SKU is NULL)
UPDATE models
SET sku = generate_product_sku(customer_name, title, id)
WHERE sku IS NULL;

-- Update existing model_variants with generated SKUs (where SKU is NULL)
UPDATE model_variants
SET sku = generate_variant_sku(
    (SELECT sku FROM models WHERE id = model_variants.parent_model_id),
    variant_name,
    hex_color
)
WHERE sku IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN models.sku IS 'Unique Stock Keeping Unit for the product. Format: {CUSTOMER_CODE}-{PRODUCT_CODE}-{ID_SUFFIX}';
COMMENT ON COLUMN model_variants.sku IS 'Unique Stock Keeping Unit for the variant. Format: {PRODUCT_SKU}-{VARIANT_CODE}';