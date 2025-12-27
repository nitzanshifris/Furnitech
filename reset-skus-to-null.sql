-- Reset all auto-generated SKUs to NULL
-- This makes SKUs user-defined only

-- Reset all product SKUs to NULL
UPDATE models SET sku = NULL;

-- Reset all variant SKUs to NULL
UPDATE model_variants SET sku = NULL;

-- Optional: Display count of affected rows
SELECT
  (SELECT COUNT(*) FROM models WHERE sku IS NULL) as models_reset,
  (SELECT COUNT(*) FROM model_variants WHERE sku IS NULL) as variants_reset;