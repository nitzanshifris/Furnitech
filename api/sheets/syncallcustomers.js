import { sheetsClient } from '../../lib/google-sheets.js';
import { getModelsWithVariants, getCustomers } from '../../lib/supabase.js';
import { transformProductsToSheetData } from '../../lib/sheets-data-mapper.js';

/**
 * Sync all customers to individual tabs in the Google Sheet
 * GET /api/sheets/sync-all-customers
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    console.log('Starting sync for all customers to individual tabs...');

    // Get all products
    const allProducts = await getModelsWithVariants();

    // Get unique customers
    const uniqueCustomers = [];
    const customerMap = new Map();

    for (const product of allProducts) {
      if (product.customer_id && product.customer_id !== 'unassigned') {
        if (!customerMap.has(product.customer_id)) {
          customerMap.set(product.customer_id, {
            id: product.customer_id,
            name: product.customer_name || product.customer_id,
            products: []
          });
        }
        customerMap.get(product.customer_id).products.push(product);
      }
    }

    // Convert map to array
    for (const [id, customer] of customerMap) {
      uniqueCustomers.push(customer);
    }

    console.log(`Found ${uniqueCustomers.length} unique customers to sync`);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    // Process each customer
    for (const customer of uniqueCustomers) {
      try {
        console.log(`Syncing ${customer.name} (${customer.products.length} products)...`);

        // Transform customer's products to sheet data
        const sheetData = transformProductsToSheetData(customer.products);

        // Create/update customer tab
        const tabName = sanitizeTabName(customer.name);
        await ensureTabExists(tabName);

        // Clear and write data
        await clearTab(tabName);
        const writeResult = await writeToTab(tabName, sheetData);

        if (writeResult.success) {
          results.push({
            customer: customer.name,
            customerId: customer.id,
            status: 'success',
            products: customer.products.length,
            variants: customer.products.reduce((sum, p) => sum + (p.variants?.length || 0), 0),
            rows: sheetData.length,
            tabName: tabName
          });
          successCount++;
        } else {
          throw new Error(writeResult.error);
        }

      } catch (error) {
        console.error(`Failed to sync ${customer.name}:`, error.message);
        results.push({
          customer: customer.name,
          customerId: customer.id,
          status: 'failed',
          error: error.message
        });
        failCount++;
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Also update the master sheet with all products
    console.log('Updating master sheet with all products...');

    // Ensure Master tab exists (rename Sheet1 if needed)
    await ensureMasterTab();

    const allSheetData = transformProductsToSheetData(allProducts);
    await clearTab('Master');
    await writeToTab('Master', allSheetData);

    return res.status(200).json({
      success: true,
      message: `Synced ${successCount} customers successfully`,
      summary: {
        totalCustomers: uniqueCustomers.length,
        successful: successCount,
        failed: failCount,
        totalProducts: allProducts.length,
        totalVariants: allProducts.reduce((sum, p) => sum + (p.variants?.length || 0), 0)
      },
      results: results,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`,
      instructions: 'Each customer now has their own tab in your Google Sheet!'
    });

  } catch (error) {
    console.error('Sync all customers error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync customers',
      message: error.message
    });
  }
}

/**
 * Ensure Master tab exists (rename Sheet1 if needed)
 */
async function ensureMasterTab() {
  try {
    await sheetsClient.initialize();

    const response = await sheetsClient.sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID
    });

    const sheets = response.data.sheets || [];
    const masterExists = sheets.some(sheet => sheet.properties.title === 'Master');
    const sheet1Exists = sheets.some(sheet => sheet.properties.title === 'Sheet1');

    if (!masterExists) {
      if (sheet1Exists) {
        // Rename Sheet1 to Master
        console.log('Renaming Sheet1 to Master...');
        const sheet1 = sheets.find(sheet => sheet.properties.title === 'Sheet1');

        await sheetsClient.sheets.spreadsheets.batchUpdate({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          requestBody: {
            requests: [{
              updateSheetProperties: {
                properties: {
                  sheetId: sheet1.properties.sheetId,
                  title: 'Master'
                },
                fields: 'title'
              }
            }]
          }
        });
        console.log('Successfully renamed Sheet1 to Master');
      } else {
        // Create new Master tab
        console.log('Creating new Master tab...');
        await sheetsClient.sheets.spreadsheets.batchUpdate({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: 'Master',
                  index: 0, // Put it first
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: 10
                  }
                }
              }
            }]
          }
        });
      }
    }

    return { success: true };

  } catch (error) {
    console.error('Error ensuring Master tab exists:', error);
    throw error;
  }
}

/**
 * Ensure a tab exists in the Google Sheet
 */
async function ensureTabExists(tabName) {
  try {
    await sheetsClient.initialize();

    const response = await sheetsClient.sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID
    });

    const sheets = response.data.sheets || [];
    const tabExists = sheets.some(sheet => sheet.properties.title === tabName);

    if (!tabExists) {
      console.log(`Creating new tab: ${tabName}`);

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
    await sheetsClient.clearRange(`${tabName}!A:Z`);
    return { success: true };
  } catch (error) {
    console.warn(`Could not clear tab ${tabName}:`, error.message);
    return { success: false };
  }
}

/**
 * Write data to a specific tab
 */
async function writeToTab(tabName, data) {
  try {
    const range = `${tabName}!A1:E${data.length}`;
    const result = await sheetsClient.writeRange(range, data);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Sanitize customer name for use as tab name
 */
function sanitizeTabName(name) {
  if (!name) return 'Unknown';

  return name
    .replace(/[\/\\\*\?\[\]:]/g, '') // Remove invalid chars
    .substring(0, 100) // Limit length
    .trim();
}