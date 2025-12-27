/**
 * Data transformation functions for Google Sheets integration
 * Converts AR platform database records to Google Sheets format
 */

/**
 * Transform a product model to Google Sheets row format
 * @param {Object} model - Product model from database
 * @returns {Array} - Array of values for Google Sheets row
 */
export function transformProductToSheetRow(model) {
  const customer = model.customer_name || model.customer_id || 'Unknown Customer';
  const name = model.title || 'Untitled Product';

  // Keep empty SKUs empty - don't auto-generate
  const sku = (model.sku && model.sku.trim() !== '') ? model.sku : '';

  // Generate AR view link
  let arLink;
  if (model.url_slug && model.customer_slug) {
    arLink = `https://newfurniture.live/f/${model.customer_slug}/${model.url_slug}-${model.id}`;
  } else {
    arLink = `https://newfurniture.live/view?id=${model.id}`;
  }

  // Generate QR code SVG link using existing QR API
  const qrLink = `https://newfurniture.live/api/u4?url=${encodeURIComponent(arLink)}&format=svg&size=200&raw=true`;

  return [customer, name, sku, arLink, qrLink];
}

/**
 * Transform a variant to Google Sheets row format
 * @param {Object} variant - Product variant from database
 * @param {Object} parentModel - Parent product model
 * @returns {Array} - Array of values for Google Sheets row
 */
export function transformVariantToSheetRow(variant, parentModel) {
  const customer = parentModel.customer_name || parentModel.customer_id || 'Unknown Customer';
  const variantName = `${parentModel.title} - ${variant.variant_name}`;

  // Keep empty SKUs empty - don't auto-generate
  let variantSku;
  if (variant.sku && variant.sku.trim() !== '') {
    // Use variant's own SKU if it exists
    variantSku = variant.sku;
  } else if (parentModel.sku && parentModel.sku.trim() !== '') {
    // Use parent SKU + variant name if parent has SKU
    variantSku = `${parentModel.sku}-${variant.variant_name.replace(/\s+/g, '').toUpperCase()}`;
  } else {
    // Both are empty - keep it empty!
    variantSku = '';
  }

  // Generate variant AR view link - ALWAYS use query parameter format for variants
  // This is the consistent format used throughout the platform
  const arLink = `https://newfurniture.live/view?id=${parentModel.id}&variant=${variant.id}`;

  // Generate variant QR code SVG link
  const qrLink = `https://newfurniture.live/api/u4?url=${encodeURIComponent(arLink)}&format=svg&size=200&raw=true`;

  return [customer, variantName, variantSku, arLink, qrLink];
}

/**
 * Transform multiple products and their variants to sheet rows
 * @param {Array} models - Array of product models with variants
 * @returns {Array} - Array of sheet rows [headers + data]
 */
export function transformProductsToSheetData(models) {
  const headers = ['Customer', 'Name', 'SKU', 'AR_View_Link', 'QR_Code_SVG'];
  const rows = [headers];

  for (const model of models) {
    // Add main product row
    rows.push(transformProductToSheetRow(model));

    // Add variant rows if variants exist
    if (model.variants && model.variants.length > 0) {
      for (const variant of model.variants) {
        rows.push(transformVariantToSheetRow(variant, model));
      }
    }
  }

  return rows;
}

/**
 * Generate batch data for Google Sheets from database query results
 * @param {Array} dbResults - Results from database query (models + variants)
 * @returns {Object} - Formatted data ready for Google Sheets API
 */
export function generateSheetsBatchData(dbResults) {
  if (!dbResults || dbResults.length === 0) {
    return {
      range: 'Sheet1!A1:E1',
      values: [['Customer', 'Name', 'SKU', 'AR_View_Link', 'QR_Code_SVG']]
    };
  }

  const sheetData = transformProductsToSheetData(dbResults);
  const lastRow = sheetData.length;

  return {
    range: `Sheet1!A1:E${lastRow}`,
    values: sheetData,
    metadata: {
      totalRows: lastRow,
      totalProducts: dbResults.length,
      totalVariants: dbResults.reduce((sum, model) => sum + (model.variants?.length || 0), 0),
      lastUpdated: new Date().toISOString()
    }
  };
}

/**
 * Create URL-safe SKU from product data
 * @param {Object} product - Product model or variant
 * @param {string} customerId - Customer identifier
 * @returns {string} - Generated SKU
 */
export function generateSku(product, customerId) {
  const customerCode = customerId?.toUpperCase() || 'UNKNOWN';
  const productCode = product.title
    ?.replace(/[^a-zA-Z0-9\u0590-\u05FF]/g, '') // Keep alphanumeric + Hebrew
    ?.substring(0, 10)
    ?.toUpperCase() || 'PRODUCT';
  const idCode = product.id?.substring(0, 8) || 'ID';

  return `${customerCode}-${productCode}-${idCode}`;
}

/**
 * Validate sheet row data before sending to Google Sheets
 * @param {Array} row - Sheet row data
 * @returns {Object} - Validation result
 */
export function validateSheetRow(row) {
  const errors = [];

  if (!row || !Array.isArray(row)) {
    errors.push('Row must be an array');
    return { valid: false, errors };
  }

  if (row.length !== 5) {
    errors.push('Row must have exactly 5 columns');
  }

  const [customer, name, sku, arLink, qrLink] = row;

  if (!customer || typeof customer !== 'string') {
    errors.push('Customer is required and must be a string');
  }

  if (!name || typeof name !== 'string') {
    errors.push('Name is required and must be a string');
  }

  if (!sku || typeof sku !== 'string') {
    errors.push('SKU is required and must be a string');
  }

  if (!arLink || !arLink.startsWith('https://')) {
    errors.push('AR_View_Link must be a valid HTTPS URL');
  }

  if (!qrLink || !qrLink.startsWith('https://')) {
    errors.push('QR_Code_SVG must be a valid HTTPS URL');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Clean and format text for Google Sheets
 * @param {string} text - Input text
 * @returns {string} - Cleaned text
 */
export function cleanTextForSheets(text) {
  if (!text) return '';

  return text
    .trim()
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\t/g, ' ') // Replace tabs with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .substring(0, 500); // Limit length for sheets
}

/**
 * Generate QR code URL for a given AR link
 * @param {string} arLink - AR viewing link
 * @param {string} format - 'svg' or 'png'
 * @param {number} size - QR code size in pixels
 * @returns {string} - QR code URL
 */
export function generateQrCodeUrl(arLink, format = 'svg', size = 200) {
  const baseUrl = 'https://newfurniture.live/api/u4';
  const params = new URLSearchParams({
    url: arLink,
    format,
    size: size.toString(),
    raw: 'true'
  });

  return `${baseUrl}?${params.toString()}`;
}