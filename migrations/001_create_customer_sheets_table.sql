-- Migration: Create customer_sheets table for Google Sheets integration
-- This table tracks Google Sheets created for each customer

CREATE TABLE IF NOT EXISTS customer_sheets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id VARCHAR(100) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  google_sheet_id VARCHAR(255) NOT NULL UNIQUE,
  sheet_url TEXT NOT NULL,
  sheet_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced TIMESTAMPTZ,
  sync_status VARCHAR(50) DEFAULT 'created', -- created, syncing, synced, error
  product_count INTEGER DEFAULT 0,
  variant_count INTEGER DEFAULT 0,
  error_message TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_sheets_customer_id ON customer_sheets(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sheets_sync_status ON customer_sheets(sync_status);
CREATE INDEX IF NOT EXISTS idx_customer_sheets_active ON customer_sheets(is_active);

-- Add comments for documentation
COMMENT ON TABLE customer_sheets IS 'Tracks Google Sheets created for each customer';
COMMENT ON COLUMN customer_sheets.customer_id IS 'References customer from models table';
COMMENT ON COLUMN customer_sheets.google_sheet_id IS 'Google Sheets spreadsheet ID';
COMMENT ON COLUMN customer_sheets.sheet_url IS 'Full URL to access the Google Sheet';
COMMENT ON COLUMN customer_sheets.sync_status IS 'Current sync status: created, syncing, synced, error';
COMMENT ON COLUMN customer_sheets.product_count IS 'Number of products in last sync';
COMMENT ON COLUMN customer_sheets.variant_count IS 'Number of variants in last sync';

-- Insert sample data for testing (optional)
-- INSERT INTO customer_sheets (customer_id, customer_name, google_sheet_id, sheet_url, sheet_name)
-- VALUES ('test_customer', 'Test Customer', 'test_sheet_id', 'https://docs.google.com/spreadsheets/d/test_sheet_id', 'Test Customer - AR Products')
-- ON CONFLICT (google_sheet_id) DO NOTHING;