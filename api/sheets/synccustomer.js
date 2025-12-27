import { sheetsClient } from '../../lib/google-sheets.js';
import { getModelsWithVariants } from '../../lib/supabase.js';
import { transformProductsToSheetData } from '../../lib/sheets-data-mapper.js';

/**
 * Sync specific customer products to a sheet tab
 * GET /api/sheets/sync-customer?customerId=napo&customerName=Napo
 * POST /api/sheets/sync-customer with body: {customerId, customerName}
 */
export default async function handler(req, res) {
  try {
    // Get parameters from query or body
    let customerId, customerName;

    if (req.method === 'GET') {
      customerId = req.query.customerId;
      customerName = req.query.customerName || customerId;
    } else if (req.method === 'POST') {
      const body = req.body || {};
      customerId = body.customerId;
      customerName = body.customerName || customerId;
    } else {
      return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
    }

    // Special case for syncing all customers to the master sheet
    if (customerId === 'all' || !customerId) {
      return await syncAllToMasterSheet(res);
    }

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'Missing customerId parameter',
        usage: 'GET /api/sheets/sync-customer?customerId=napo&customerName=Napo'
      });
    }

    console.log(`Syncing products for customer: ${customerName} (${customerId})`);

    // Fetch all products from database
    const allProducts = await getModelsWithVariants();

    // Filter products for this customer
    const customerProducts = allProducts.filter(product =>
      product.customer_id === customerId ||
      product.customer_name === customerName
    );

    if (customerProducts.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No products found for customer: ${customerName}`,
        customerId,
        totalProductsInSystem: allProducts.length
      });
    }

    // Transform data for Google Sheets
    const sheetData = transformProductsToSheetData(customerProducts);

    // Create or update customer tab
    const tabName = sanitizeTabName(customerName);
    await ensureTabExists(tabName);

    // Clear existing data in customer tab
    await clearTab(tabName);

    // Write new data to customer tab
    const writeResult = await writeToTab(tabName, sheetData);

    if (!writeResult.success) {
      throw new Error(`Failed to write to sheet: ${writeResult.error}`);
    }

    // Calculate statistics
    const stats = {
      customer: customerName,
      customerId: customerId,
      products: customerProducts.length,
      variants: customerProducts.reduce((sum, p) => sum + (p.variants?.length || 0), 0),
      rows: sheetData.length,
      updatedCells: writeResult.updatedCells || 0,
      tabName: tabName,
      syncTime: new Date().toISOString()
    };

    console.log(`Customer sync completed:`, stats);

    return res.status(200).json({
      success: true,
      message: `Customer ${customerName} products synced to tab "${tabName}"`,
      stats,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit#gid=${tabName}`
    });

  } catch (error) {
    console.error('Customer sync error:', error);
    return res.status(500).json({
      success: false,
      error: 'Sync failed',
      message: error.message
    });
  }
}

/**
 * Sync all products to master sheet
 */
async function syncAllToMasterSheet(res) {
  try {
    console.log('Syncing all products to master sheet...');

    const products = await getModelsWithVariants();
    const sheetData = transformProductsToSheetData(products);

    // Write to main Sheet1 tab
    await clearTab('Sheet1');
    const writeResult = await writeToTab('Sheet1', sheetData);

    const stats = {
      products: products.length,
      variants: products.reduce((sum, p) => sum + (p.variants?.length || 0), 0),
      rows: sheetData.length,
      updatedCells: writeResult.updatedCells || 0
    };

    return res.status(200).json({
      success: true,
      message: 'All products synced to master sheet',
      stats
    });

  } catch (error) {
    console.error('Master sync error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Ensure a tab exists in the Google Sheet
 */
async function ensureTabExists(tabName) {
  try {
    await sheetsClient.initialize();

    // Try to get the sheet properties
    const response = await sheetsClient.sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID
    });

    const sheets = response.data.sheets || [];
    const tabExists = sheets.some(sheet => sheet.properties.title === tabName);

    if (!tabExists) {
      console.log(`Creating new tab: ${tabName}`);

      // Add new sheet tab
      await sheetsClient.sheets.spreadsheets.batchUpdate({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: tabName,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 10
                }
              }
            }
          }]
        }
      });

      console.log(`Tab "${tabName}" created successfully`);
    } else {
      console.log(`Tab "${tabName}" already exists`);
    }

    return { success: true };

  } catch (error) {
    console.error('Error ensuring tab exists:', error);
    throw error;
  }
}

/**
 * Clear all data in a tab
 */
async function clearTab(tabName) {
  try {
    const clearResult = await sheetsClient.clearRange(`${tabName}!A:Z`);
    console.log(`Cleared tab: ${tabName}`);
    return clearResult;
  } catch (error) {
    console.warn(`Could not clear tab ${tabName}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Write data to a specific tab
 */
async function writeToTab(tabName, data) {
  try {
    const range = `${tabName}!A1:E${data.length}`;
    const result = await sheetsClient.writeRange(range, data);
    return result;
  } catch (error) {
    console.error(`Error writing to tab ${tabName}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Sanitize customer name for use as tab name
 */
function sanitizeTabName(name) {
  if (!name) return 'Unknown';

  // Remove invalid characters for sheet names
  return name
    .replace(/[\/\\\*\?\[\]:]/g, '') // Remove invalid chars
    .substring(0, 100) // Limit length
    .trim();
}