import { createCustomerSheet, getCustomerSheet, createSheetsForExistingCustomers } from '../../lib/customer-sheets.js';

/**
 * Create Google Sheet for a specific customer
 * POST /api/sheets/create-customer-sheet
 * Body: { customerId, customerName } or { createForExisting: true }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { customerId, customerName, createForExisting } = req.body;

    // Handle bulk creation for existing customers
    if (createForExisting === true) {
      console.log('Creating sheets for all existing customers...');

      const result = await createSheetsForExistingCustomers();

      return res.status(200).json({
        success: result.success,
        message: result.success
          ? `Bulk creation completed: ${result.summary.successful} successful, ${result.summary.failed} failed`
          : 'Bulk creation failed',
        summary: result.summary || null,
        details: result.results || null,
        error: result.error || null
      });
    }

    // Validate required fields for single customer creation
    if (!customerId || !customerName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customerId and customerName'
      });
    }

    // Validate customer ID format
    if (typeof customerId !== 'string' || customerId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid customerId: must be non-empty string'
      });
    }

    // Validate customer name
    if (typeof customerName !== 'string' || customerName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid customerName: must be non-empty string'
      });
    }

    console.log(`Creating sheet for customer: ${customerName} (${customerId})`);

    // Create the customer sheet
    const result = await createCustomerSheet(customerId.trim(), customerName.trim());

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create customer sheet',
        details: result.error
      });
    }

    // Return success response
    return res.status(200).json({
      success: true,
      message: result.message,
      sheet: {
        customer_id: result.sheet.customer_id,
        customer_name: result.sheet.customer_name,
        google_sheet_id: result.sheet.google_sheet_id,
        sheet_url: result.sheet.sheet_url,
        sheet_name: result.sheet.sheet_name,
        created_at: result.sheet.created_at,
        sync_status: result.sheet.sync_status
      }
    });

  } catch (error) {
    console.error('Customer sheet creation endpoint error:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Usage Examples:
 *
 * Create sheet for specific customer:
 * POST /api/sheets/create-customer-sheet
 * {
 *   "customerId": "napo_furniture",
 *   "customerName": "Napo Furniture"
 * }
 *
 * Create sheets for all existing customers:
 * POST /api/sheets/create-customer-sheet
 * {
 *   "createForExisting": true
 * }
 */