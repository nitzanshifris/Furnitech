import { getModelsWithVariants } from '../../lib/supabase.js';
import { readAndParseTabData } from '../../lib/sheets-reader.js';
import { compareDataForSync } from '../../lib/sync-comparer.js';

/**
 * Debug endpoint to see what the sync comparison finds
 * GET /api/sheets/debug-sync?customer=CUSTOMER_NAME
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    const customerName = req.query.customer || 'Napo'; // Default to Napo for testing

    console.log(`Debugging sync for customer: ${customerName}`);

    // Get database products
    const allProducts = await getModelsWithVariants();
    const customerProducts = allProducts.filter(product =>
      product.customer_name === customerName ||
      product.customer_id === customerName ||
      product.customer_name?.toLowerCase() === customerName.toLowerCase() ||
      product.customer_id?.toLowerCase() === customerName.toLowerCase()
    );

    console.log(`Found ${customerProducts.length} products in database for ${customerName}`);

    // Get sheet data
    const tabName = customerName.replace(/[\/\\*?[\]:]/g, '').trim();
    const sheetData = await readAndParseTabData(tabName);

    console.log(`Found ${sheetData.productsList?.length || 0} products in sheet for ${customerName}`);

    // Do comparison
    const comparison = compareDataForSync(customerProducts, sheetData.products || new Map());

    // Detailed debug info
    const debug = {
      customer: customerName,
      tabName: tabName,
      database: {
        count: customerProducts.length,
        products: customerProducts.slice(0, 3).map(p => ({
          id: p.id,
          title: p.title,
          sku: p.sku,
          customer_name: p.customer_name,
          customer_id: p.customer_id,
          variants: p.variants?.length || 0
        }))
      },
      sheet: {
        count: sheetData.productsList?.length || 0,
        products: sheetData.productsList?.slice(0, 3).map(p => ({
          uniqueKey: p.uniqueKey,
          name: p.name,
          sku: p.sku,
          customer: p.customer,
          modelId: p.modelId,
          variantId: p.variantId
        })) || []
      },
      comparison: comparison,
      examples: {
        newItems: comparison.changes.new.slice(0, 2),
        updatedItems: comparison.changes.updated.slice(0, 2),
        unchangedItems: comparison.changes.unchanged.slice(0, 2),
        deletedItems: comparison.changes.deleted.slice(0, 2)
      }
    };

    return res.status(200).json({
      success: true,
      debug: debug
    });

  } catch (error) {
    console.error('Debug sync error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}