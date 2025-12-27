-- Check BLUSH model migration status
SELECT
    id,
    title,
    storage_location,
    aws_url,
    cloudinary_url,
    migrated_at
FROM models
WHERE id = 'o8U54bIP';

-- Check BLUSH variants status
SELECT
    id,
    variant_name,
    hex_color,
    storage_location,
    aws_url,
    cloudinary_url
FROM model_variants
WHERE parent_model_id = 'o8U54bIP';