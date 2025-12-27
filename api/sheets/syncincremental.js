import { sheetsClient } from '../../lib/google-sheets.js';
import { getModelsWithVariants } from '../../lib/supabase.js';
import { readAndParseTabData } from '../../lib/sheets-reader.js';
import { compareDataForSync, generateSheetUpdates } from '../../lib/sync-comparer.js';

/**
 * Incremental sync - only add new/update changed data
 * GET /api/sheets/syncincremental
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    console.log('Starting incremental Google Sheets sync...');

    // Step 1: Get all products from database
    const allProducts = await getModelsWithVariants();
    console.log(`Fetched ${allProducts.length} products from database`);

    // Step 2: Group products by customer
    const customerMap = new Map();
    for (const product of allProducts) {
      if (product.customer_id && product.customer_id !== 'unassigned') {
        const customerId = product.customer_id;
        const customerName = product.customer_name || customerId;

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            id: customerId,
            name: customerName,
            products: []
          });
        }
        customerMap.get(customerId).products.push(product);
      }
    }

    const uniqueCustomers = Array.from(customerMap.values());
    console.log(`Processing ${uniqueCustomers.length} unique customers`);

    // Step 3: Process each customer incrementally
    const results = [];
    const debugInfo = [];
    let totalNew = 0;
    let totalUpdated = 0;
    let totalUnchanged = 0;

    for (const customer of uniqueCustomers) {
      try {
        console.log(`Processing ${customer.name} (${customer.products.length} products)...`);

        // Create/ensure customer tab exists
        const tabName = sanitizeTabName(customer.name);
        await ensureTabExists(tabName);

        // Read existing data from this customer's tab
        const existingData = await readAndParseTabData(tabName);
        if (!existingData.success) {
          throw new Error(`Failed to read existing data: ${existingData.error}`);
        }

        // Compare database vs existing sheet data
        const comparison = compareDataForSync(customer.products, existingData.products);

        // Debug logging
        const debugData = {
          customer: customer.name,
          dbProducts: customer.products.length,
          sheetProducts: existingData.productsList?.length || 0,
          summary: comparison.summary,
          firstDbProduct: customer.products[0] ? {
            id: customer.products[0].id,
            title: customer.products[0].title,
            sku: customer.products[0].sku,
            customer_name: customer.products[0].customer_name
          } : null,
          firstSheetProduct: existingData.productsList?.[0] || null,
          hasChanges: comparison.hasChanges
        };

        // Add detailed SKU info for debugging
        debugData.skuAnalysis = {
          dbSkus: customer.products.slice(0, 3).map(p => ({
            id: p.id,
            title: p.title,
            sku: p.sku || '(empty)',
            variants: p.variants?.slice(0, 2).map(v => ({
              id: v.id,
              name: v.name,
              sku: v.sku || '(empty)'
            })) || []
          })),
          sheetSkus: existingData.productsList?.slice(0, 3).map(p => ({
            uniqueKey: p.uniqueKey,
            name: p.name,
            sku: p.sku || '(empty)'
          })) || []
        };

        debugInfo.push(debugData);
        console.log(`${customer.name} comparison:`, debugData);

        // Apply incremental updates
        if (comparison.hasChanges) {
          const updateResult = await applyIncrementalUpdates(tabName, comparison, customer.products);

          results.push({
            customer: customer.name,
            customerId: customer.id,
            status: 'updated',
            changes: comparison.summary,
            operations: updateResult.operationsCount,
            syncMethod: updateResult.method,
            tabName: tabName
          });

          totalNew += comparison.summary.new;
          totalUpdated += comparison.summary.updated;
        } else {
          results.push({
            customer: customer.name,
            customerId: customer.id,
            status: 'no_changes',
            changes: comparison.summary,
            tabName: tabName
          });
        }

        totalUnchanged += comparison.summary.unchanged;

      } catch (error) {
        console.error(`Failed to sync ${customer.name}:`, error.message);
        results.push({
          customer: customer.name,
          customerId: customer.id,
          status: 'failed',
          error: error.message
        });
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Step 4: Update Master sheet (full replace for master)
    console.log('Updating master sheet...');
    await updateMasterSheet(allProducts);

    return res.status(200).json({
      success: true,
      message: 'Incremental sync completed successfully',
      summary: {
        totalCustomers: uniqueCustomers.length,
        totalProducts: allProducts.length,
        totalVariants: allProducts.reduce((sum, p) => sum + (p.variants?.length || 0), 0),
        changes: {
          new: totalNew,
          updated: totalUpdated,
          unchanged: totalUnchanged
        }
      },
      results: results,
      debug: debugInfo,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}/edit`,
      syncType: 'incremental'
    });

  } catch (error) {
    console.error('Incremental sync error:', error);
    return res.status(500).json({
      success: false,
      error: 'Incremental sync failed',
      message: error.message
    });
  }
}

/**
 * Apply incremental updates to a specific tab
 */
async function applyIncrementalUpdates(tabName, comparison, allCustomerProducts) {
  const updates = generateSheetUpdates(comparison);
  let operationsCount = 0;
  let method = 'incremental';

  try {
    // If there are deletions, do a full replace (easier than complex row management)
    if (comparison.summary.deleted > 0) {
      console.log(`${tabName}: Found ${comparison.summary.deleted} deleted items, doing full replace`);

      // Import the transformer
      const { transformProductsToSheetData } = await import('../../lib/sheets-data-mapper.js');
      const sheetData = transformProductsToSheetData(allCustomerProducts);

      // Clear and write all data
      await clearTab(tabName);
      await writeToTab(tabName, sheetData);

      operationsCount = sheetData.length;
      method = 'full_replace_due_to_deletions';

      console.log(`Full replace completed for ${tabName}: ${operationsCount} total rows`);

    } else {
      // No deletions, can do true incremental updates

      // Handle new items (append)
      const appendOps = updates.operations.filter(op => op.type === 'append');
      if (appendOps.length > 0) {
        const appendData = appendOps.map(op => op.data);

        // Find next empty row to append to
        const existingData = await sheetsClient.sheets.spreadsheets.values.get({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: `${tabName}!A:A`
        });

        const nextRow = (existingData.data.values?.length || 0) + 1;
        const appendRange = `${tabName}!A${nextRow}:E${nextRow + appendData.length - 1}`;

        await sheetsClient.writeRange(appendRange, appendData);
        operationsCount += appendData.length;
        console.log(`Appended ${appendData.length} new rows to ${tabName}`);
      }

      // Handle updates (specific row updates)
      const updateOps = updates.operations.filter(op => op.type === 'update');
      for (const updateOp of updateOps) {
        const updateRange = `${tabName}!A${updateOp.rowIndex}:E${updateOp.rowIndex}`;
        await sheetsClient.writeRange(updateRange, [updateOp.data]);
        operationsCount++;
      }

      if (updateOps.length > 0) {
        console.log(`Updated ${updateOps.length} existing rows in ${tabName}`);
      }

      method = 'incremental';
    }

    return { success: true, operationsCount, method };

  } catch (error) {
    console.error(`Error applying updates to ${tabName}:`, error);
    throw error;
  }
}

/**
 * Update master sheet with all data (full replace)
 */
async function updateMasterSheet(allProducts) {
  try {
    // Import the original transformer
    const { transformProductsToSheetData } = await import('../../lib/sheets-data-mapper.js');

    await ensureMasterTab();

    const sheetData = transformProductsToSheetData(allProducts);
    await clearTab('Master');
    await writeToTab('Master', sheetData);

    console.log('Master sheet updated successfully');
  } catch (error) {
    console.error('Error updating master sheet:', error);
    throw error;
  }
}

/**
 * Helper functions (imported from syncallcustomers.js)
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

      // Add headers to new tab
      const headers = [['Customer', 'Name', 'SKU', 'AR_View_Link', 'QR_Code_SVG']];
      await sheetsClient.writeRange(`${tabName}!A1:E1`, headers);
    }

    return { success: true };
  } catch (error) {
    console.error('Error ensuring tab exists:', error);
    throw error;
  }
}

async function ensureMasterTab() {
  await ensureTabExists('Master');
}

async function clearTab(tabName) {
  try {
    await sheetsClient.clearRange(`${tabName}!A2:Z1000`); // Keep headers
    return { success: true };
  } catch (error) {
    console.warn(`Could not clear tab ${tabName}:`, error.message);
    return { success: false };
  }
}

async function writeToTab(tabName, data) {
  try {
    const range = `${tabName}!A1:E${data.length}`;
    const result = await sheetsClient.writeRange(range, data);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function sanitizeTabName(name) {
  if (!name) return 'Unknown';
  return name
    .replace(/[\/\\*?[\]:]/g, '') // Remove invalid chars
    .substring(0, 100) // Limit length
    .trim();
}