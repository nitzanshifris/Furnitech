-- Migration: Add QR Code Persistence Columns
-- This adds QR code URL storage to models and variants for 100% uptime

-- Add QR columns to models table
ALTER TABLE models
ADD COLUMN IF NOT EXISTS qr_code_url TEXT,
ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMPTZ;

-- Add QR columns to model_variants table
ALTER TABLE model_variants
ADD COLUMN IF NOT EXISTS qr_code_url TEXT,
ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMPTZ;

-- Create index for faster QR lookups
CREATE INDEX IF NOT EXISTS idx_models_qr_generated_at ON models(qr_generated_at);
CREATE INDEX IF NOT EXISTS idx_variants_qr_generated_at ON model_variants(qr_generated_at);

-- Optional: Create a QR generation log table for monitoring
CREATE TABLE IF NOT EXISTS qr_generation_log (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT,
  variant_id TEXT,
  generation_method VARCHAR(20), -- 'local', 'fallback', 'emergency'
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  processing_time_ms INTEGER,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for log queries
CREATE INDEX IF NOT EXISTS idx_qr_log_model_variant ON qr_generation_log(model_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_qr_log_generated_at ON qr_generation_log(generated_at DESC);