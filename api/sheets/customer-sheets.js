import { getAllCustomerSheets, getCustomerSheet, updateCustomerSheetSync } from '../../lib/customer-sheets.js';

/**
 * Manage customer sheets
 * GET /api/sheets/customer-sheets - Get all customer sheets
 * GET /api/sheets/customer-sheets?customerId=xxx - Get specific customer sheet
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    const { customerId } = req.query;

    // Get specific customer sheet
    if (customerId) {
      console.log(`Getting sheet for customer: ${customerId}`);

      const result = await getCustomerSheet(customerId);

      return res.status(200).json({
        success: result.success,
        sheet: result.sheet,
        message: result.message || null,
        error: result.error || null
      });
    }

    // Get all customer sheets
    console.log('Getting all customer sheets...');

    const result = await getAllCustomerSheets();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to get customer sheets',
        details: result.error
      });
    }

    // Add summary statistics
    const sheets = result.sheets;
    const summary = {
      total: sheets.length,
      synced: sheets.filter(s => s.sync_status === 'synced').length,
      created: sheets.filter(s => s.sync_status === 'created').length,
      error: sheets.filter(s => s.sync_status === 'error').length,
      totalProducts: sheets.reduce((sum, s) => sum + (s.product_count || 0), 0),
      totalVariants: sheets.reduce((sum, s) => sum + (s.variant_count || 0), 0)
    };

    return res.status(200).json({
      success: true,
      sheets: sheets,
      summary: summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Customer sheets endpoint error:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}