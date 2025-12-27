import { sheetsClient } from './google-sheets.js';

/**
 * Read existing data from Google Sheets for comparison
 */

/**
 * Read all data from a specific sheet tab
 * @param {string} tabName - Name of the tab to read
 * @returns {Object} - {success: boolean, data: Array, headers: Array}
 */
export async function readTabData(tabName) {
  try {
    await sheetsClient.initialize();

    // First, check if tab exists
    const response = await sheetsClient.sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID
    });

    const sheets = response.data.sheets || [];
    const tabExists = sheets.some(sheet => sheet.properties.title === tabName);

    if (!tabExists) {
      return {
        success: true,
        data: [],
        headers: [],
        message: `Tab '${tabName}' does not exist yet`
      };
    }

    // Read data from the tab (A1:E1000 to get headers + data)
    const readResponse = await sheetsClient.sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${tabName}!A1:E1000`
    });

    const values = readResponse.data.values || [];

    if (values.length === 0) {
      return {
        success: true,
        data: [],
        headers: [],
        message: `Tab '${tabName}' is empty`
      };
    }

    // First row is headers, rest is data
    const headers = values[0] || [];
    const data = values.slice(1) || [];

    console.log(`Read ${data.length} rows from tab '${tabName}'`);

    return {
      success: true,
      data: data,
      headers: headers,
      totalRows: data.length
    };

  } catch (error) {
    console.error(`Error reading tab '${tabName}':`, error);
    return {
      success: false,
      error: error.message,
      data: [],
      headers: []
    };
  }
}

/**
 * Parse sheet row data into structured format for comparison
 * @param {Array} rowData - Raw row data from sheets [Customer, Name, SKU, AR_Link, QR_SVG]
 * @param {number} rowIndex - Row index for reference
 * @returns {Object} - Structured product data
 */
export function parseSheetRow(rowData, rowIndex) {
  if (!rowData || rowData.length < 4) {
    return null;
  }

  // Extract model_id and variant_id from AR link
  // AR link format: https://newfurniture.live/view?id=MODEL_ID&variant=VARIANT_ID
  const arLink = rowData[3] || '';
  let modelId = null;
  let variantId = null;

  if (arLink.includes('view?id=')) {
    const urlParams = new URLSearchParams(arLink.split('?')[1] || '');
    modelId = urlParams.get('id');
    variantId = urlParams.get('variant');
  }

  return {
    rowIndex: rowIndex + 2, // +2 because sheet is 1-indexed and we skip header
    customer: rowData[0] || '',
    name: rowData[1] || '',
    sku: rowData[2] || '',
    arLink: arLink,
    qrSvg: rowData[4] || '',
    modelId: modelId,
    variantId: variantId,
    // Create unique identifier for comparison
    uniqueKey: `${modelId}_${variantId}`
  };
}

/**
 * Read and parse all data from a tab into structured format
 * @param {string} tabName - Name of the tab to read
 * @returns {Object} - {success: boolean, products: Map, rawData: Array}
 */
export async function readAndParseTabData(tabName) {
  const readResult = await readTabData(tabName);

  if (!readResult.success) {
    return readResult;
  }

  const products = new Map();
  const validProducts = [];

  // Parse each row into structured format
  readResult.data.forEach((row, index) => {
    const parsed = parseSheetRow(row, index);
    if (parsed && parsed.uniqueKey && parsed.uniqueKey !== 'null_null') {
      products.set(parsed.uniqueKey, parsed);
      validProducts.push(parsed);
    }
  });

  return {
    success: true,
    products: products, // Map for fast lookup by uniqueKey
    productsList: validProducts, // Array for iteration
    totalRows: readResult.data.length,
    validRows: validProducts.length,
    headers: readResult.headers
  };
}

/**
 * Get all customer tabs and their data
 * @returns {Object} - {success: boolean, customerData: Map}
 */
export async function readAllCustomerTabs() {
  try {
    await sheetsClient.initialize();

    // Get all sheet tabs
    const response = await sheetsClient.sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID
    });

    const sheets = response.data.sheets || [];
    const customerData = new Map();

    // Process each tab (skip Master)
    for (const sheet of sheets) {
      const tabName = sheet.properties.title;

      if (tabName === 'Master' || tabName === 'Sheet1') {
        continue; // Skip master tabs
      }

      const tabData = await readAndParseTabData(tabName);
      if (tabData.success) {
        customerData.set(tabName, tabData);
      }
    }

    return {
      success: true,
      customerData: customerData,
      totalTabs: customerData.size
    };

  } catch (error) {
    console.error('Error reading all customer tabs:', error);
    return {
      success: false,
      error: error.message,
      customerData: new Map()
    };
  }
}