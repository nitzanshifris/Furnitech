import { transformProductsToSheetData } from './sheets-data-mapper.js';

/**
 * Compare database data with existing sheet data to identify changes
 */

/**
 * Generate SKU for comparison - handles null/empty values properly
 */
function generateSkuForComparison(variantSku, productSku, customerId, variantName) {
  if (variantSku && variantSku.trim() !== '') {
    return variantSku;
  }
  if (productSku && productSku.trim() !== '') {
    if (variantName) {
      return `${productSku}-${variantName.replace(/\s+/g, '').toUpperCase()}`;
    }
    return productSku;
  }
  // Both empty - keep it empty!
  return '';
}

/**
 * Generate unique key for product variant
 * @param {Object} product - Database product object
 * @param {Object} variant - Database variant object (optional)
 * @returns {string} - Unique identifier
 */
function generateUniqueKey(product, variant = null) {
  const modelId = product.id;
  const variantId = variant ? variant.id : 'original';
  return `${modelId}_${variantId}`;
}

/**
 * Convert database product data to comparable format
 * @param {Array} products - Array of products from database
 * @returns {Map} - Map of uniqueKey -> comparable data
 */
function convertDatabaseToComparable(products) {
  console.log('🔧 convertDatabaseToComparable called with:', products.length, 'products');
  const comparableData = new Map();

  products.forEach((product, index) => {
    console.log(`🔧 Processing product ${index + 1}:`, {
      id: product.id,
      title: product.title,
      hasVariants: product.variants?.length || 0
    });
    // Add original product - generate AR link if not provided
    const arLink = product.ar_link || `https://newfurniture.live/view?id=${product.id}`;
    const key = generateUniqueKey(product);
    comparableData.set(key, {
      uniqueKey: key,
      customer: product.customer_name || product.customer_id || 'unassigned',
      name: product.title || product.name,
      sku: generateSkuForComparison(product.sku, null, product.customer_id, null),
      arLink: arLink,
      qrSvg: `https://newfurniture.live/api/u4?url=${encodeURIComponent(arLink)}&format=svg&raw=true`,
      modelId: product.id,
      variantId: 'original',
      isOriginal: true,
      source: 'database'
    });
    console.log(`🔧 Added product key: ${key}`);

    // Add variants
    if (product.variants && product.variants.length > 0) {
      product.variants.forEach(variant => {
        const key = generateUniqueKey(product, variant);
        const arLink = variant.ar_link || `https://newfurniture.live/view?id=${product.id}&variant=${variant.id}`;

        comparableData.set(key, {
          uniqueKey: key,
          customer: product.customer_name || product.customer_id || 'unassigned',
          name: variant.name || `${product.title} - ${variant.name}`,
          sku: generateSkuForComparison(variant.sku, product.sku, product.customer_id, variant.name),
          arLink: arLink,
          qrSvg: `https://newfurniture.live/api/u4?url=${encodeURIComponent(arLink)}&format=svg&raw=true`,
          modelId: product.id,
          variantId: variant.id,
          isOriginal: false,
          source: 'database'
        });
        console.log(`🔧 Added variant key: ${key}`);
      });
    }
  });

  console.log('🔧 convertDatabaseToComparable result:', {
    totalItems: comparableData.size,
    sampleKeys: Array.from(comparableData.keys()).slice(0, 3)
  });

  return comparableData;
}

/**
 * Compare two product data objects to see if they're different
 * @param {Object} dbData - Data from database
 * @param {Object} sheetData - Data from sheet
 * @returns {boolean} - True if different, false if same
 */
function isDataDifferent(dbData, sheetData) {
  // Compare key fields that might change
  const fieldsToCompare = ['customer', 'name', 'sku', 'arLink'];

  for (const field of fieldsToCompare) {
    // Normalize empty values: null, undefined, and empty strings all become ''
    const dbValue = normalizeValue(dbData[field]);
    const sheetValue = normalizeValue(sheetData[field]);

    if (dbValue !== sheetValue) {
      console.log(`Field '${field}' differs: DB='${dbValue}' vs Sheet='${sheetValue}'`);
      return true;
    }
  }

  return false;
}

/**
 * Normalize values for comparison - treat null, undefined, and empty strings as equivalent
 */
function normalizeValue(value) {
  if (value === null || value === undefined || value === 'null' || value === 'undefined') {
    return '';
  }
  return value.toString().trim();
}

/**
 * Compare database data with sheet data and identify changes
 * @param {Array} databaseProducts - Products from database
 * @param {Map} sheetProducts - Products from sheet (from readAndParseTabData)
 * @returns {Object} - Comparison results
 */
export function compareDataForSync(databaseProducts, sheetProducts) {
  console.log('🔍 compareDataForSync called with:', {
    databaseProductsCount: databaseProducts.length,
    sheetProductsSize: sheetProducts.size
  });

  const dbData = convertDatabaseToComparable(databaseProducts);
  console.log('🔍 After convertDatabaseToComparable:', {
    dbDataSize: dbData.size,
    dbDataKeys: Array.from(dbData.keys()).slice(0, 3)
  });

  const newItems = [];      // In DB but not in sheet
  const updatedItems = [];  // In both but different
  const unchangedItems = []; // In both and identical
  const deletedItems = [];  // In sheet but not in DB

  // Check database items against sheet
  for (const [uniqueKey, dbItem] of dbData) {
    if (sheetProducts.has(uniqueKey)) {
      const sheetItem = sheetProducts.get(uniqueKey);

      if (isDataDifferent(dbItem, sheetItem)) {
        console.log(`UPDATE detected for ${uniqueKey}:`, {
          db: { sku: dbItem.sku, name: dbItem.name },
          sheet: { sku: sheetItem.sku, name: sheetItem.name }
        });
        updatedItems.push({
          uniqueKey,
          dbData: dbItem,
          sheetData: sheetItem,
          action: 'update',
          rowIndex: sheetItem.rowIndex
        });
      } else {
        unchangedItems.push({
          uniqueKey,
          data: dbItem,
          action: 'unchanged'
        });
      }
    } else {
      console.log(`NEW item detected: ${uniqueKey}`, { sku: dbItem.sku, name: dbItem.name });
      newItems.push({
        uniqueKey,
        data: dbItem,
        action: 'add'
      });
    }
  }

  // Check for items in sheet but not in database (deleted)
  for (const [uniqueKey, sheetItem] of sheetProducts) {
    if (!dbData.has(uniqueKey)) {
      deletedItems.push({
        uniqueKey,
        data: sheetItem,
        action: 'delete',
        rowIndex: sheetItem.rowIndex
      });
    }
  }

  return {
    summary: {
      total: dbData.size,
      new: newItems.length,
      updated: updatedItems.length,
      unchanged: unchangedItems.length,
      deleted: deletedItems.length
    },
    changes: {
      new: newItems,
      updated: updatedItems,
      unchanged: unchangedItems,
      deleted: deletedItems
    },
    hasChanges: newItems.length > 0 || updatedItems.length > 0 || deletedItems.length > 0
  };
}

/**
 * Convert comparison results to sheet update operations
 * @param {Object} comparison - Result from compareDataForSync
 * @returns {Object} - Update operations for sheets
 */
export function generateSheetUpdates(comparison) {
  const operations = [];

  // Add new items (append to end)
  comparison.changes.new.forEach(item => {
    operations.push({
      type: 'append',
      data: [
        item.data.customer,
        item.data.name,
        item.data.sku,
        item.data.arLink,
        item.data.qrSvg
      ]
    });
  });

  // Update existing items (specific row updates)
  comparison.changes.updated.forEach(item => {
    operations.push({
      type: 'update',
      rowIndex: item.rowIndex,
      data: [
        item.dbData.customer,
        item.dbData.name,
        item.dbData.sku,
        item.dbData.arLink,
        item.dbData.qrSvg
      ]
    });
  });

  // Delete items (remove from sheet since they're not in database)
  comparison.changes.deleted.forEach(item => {
    operations.push({
      type: 'delete',
      rowIndex: item.rowIndex,
      data: item.data
    });
  });

  return {
    operations,
    summary: comparison.summary
  };
}