import { sheetsClient } from '../../lib/google-sheets.js';
import { transformProductsToSheetData, generateSheetsBatchData, validateSheetRow } from '../../lib/sheets-data-mapper.js';
import { getModelsWithVariants } from '../../lib/supabase.js';

/**
 * Sync products from database to Google Sheets
 * GET /api/sheets/sync - Full sync all products
 * POST /api/sheets/sync - Sync specific products (body: {customerIds: [], productIds: []})
 */
export default async function handler(req, res) {
  try {
    console.log(`[${new Date().toISOString()}] Starting Google Sheets sync...`);

    // Handle different HTTP methods
    let filters = {};
    if (req.method === 'POST' && req.body) {
      filters = req.body;
    } else if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
    }

    // Step 1: Fetch products from database
    const products = await fetchProductsFromDatabase(filters);

    if (products.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No products found to sync',
        stats: { products: 0, variants: 0, rows: 1 }
      });
    }

    // Step 2: Transform data for Google Sheets
    const sheetData = generateSheetsBatchData(products);

    // Step 3: Validate data before sending
    const validation = validateSheetData(sheetData.values);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Data validation failed',
        details: validation.errors
      });
    }

    // Step 4: Clear existing sheet data (use Master tab)
    const clearResult = await sheetsClient.clearRange('Master!A2:Z1000');
    if (!clearResult.success) {
      throw new Error(`Failed to clear sheet: ${clearResult.error}`);
    }

    // Step 5: Write new data to Google Sheets
    const writeResult = await sheetsClient.writeRange(
      sheetData.range,
      sheetData.values
    );

    if (!writeResult.success) {
      throw new Error(`Failed to write to sheet: ${writeResult.error}`);
    }

    // Step 6: Return success response
    const stats = {
      products: products.length,
      variants: products.reduce((sum, p) => sum + (p.variants?.length || 0), 0),
      rows: sheetData.values.length,
      updatedCells: writeResult.updatedCells,
      syncTime: new Date().toISOString()
    };

    console.log(`[${new Date().toISOString()}] Sync completed successfully:`, stats);

    return res.status(200).json({
      success: true,
      message: 'Products synced to Google Sheets successfully',
      stats,
      metadata: sheetData.metadata
    });

  } catch (error) {
    console.error('Sheets sync error:', error);

    return res.status(500).json({
      success: false,
      error: 'Sync failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Fetch products and variants from database using Supabase
 * @param {Object} filters - Filter criteria {customerIds: [], productIds: []}
 * @returns {Array} - Array of products with variants
 */
async function fetchProductsFromDatabase(filters = {}) {
  try {
    console.log('Fetching products with filters:', filters);

    // Use existing Supabase function to get models with variants
    const products = await getModelsWithVariants();

    // Apply filters if provided
    let filteredProducts = products;

    if (filters.customerIds && filters.customerIds.length > 0) {
      filteredProducts = filteredProducts.filter(product =>
        filters.customerIds.includes(product.customer_id)
      );
    }

    if (filters.productIds && filters.productIds.length > 0) {
      filteredProducts = filteredProducts.filter(product =>
        filters.productIds.includes(product.id)
      );
    }

    console.log(`Fetched ${filteredProducts.length} products from database`);
    return filteredProducts;

  } catch (error) {
    console.error('Error fetching products:', error);
    throw new Error(`Database fetch failed: ${error.message}`);
  }
}

/**
 * Validate sheet data before sending to Google Sheets
 * @param {Array} rows - Array of sheet rows
 * @returns {Object} - Validation result
 */
function validateSheetData(rows) {
  const errors = [];

  if (!rows || !Array.isArray(rows)) {
    return { valid: false, errors: ['Data must be an array of rows'] };
  }

  if (rows.length === 0) {
    return { valid: false, errors: ['No data to sync'] };
  }

  // Validate headers (first row)
  const headers = rows[0];
  const expectedHeaders = ['Customer', 'Name', 'SKU', 'AR_View_Link', 'QR_Code_SVG'];

  if (!Array.isArray(headers) || headers.length !== expectedHeaders.length) {
    errors.push('Invalid headers row');
  } else {
    for (let i = 0; i < expectedHeaders.length; i++) {
      if (headers[i] !== expectedHeaders[i]) {
        errors.push(`Header mismatch at column ${i + 1}: expected "${expectedHeaders[i]}", got "${headers[i]}"`);
      }
    }
  }

  // Validate data rows (skip header)
  for (let i = 1; i < rows.length; i++) {
    const rowValidation = validateSheetRow(rows[i]);
    if (!rowValidation.valid) {
      errors.push(`Row ${i + 1}: ${rowValidation.errors.join(', ')}`);
    }
  }

  // Limit number of error messages
  if (errors.length > 10) {
    errors.splice(10);
    errors.push('...and more errors (truncated)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}