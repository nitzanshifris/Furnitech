import { createSheetsForExistingCustomers } from '../../lib/customer-sheets.js';

/**
 * Browser-friendly endpoint to create sheets for all existing customers
 * GET /api/sheets/create-all-sheets
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    console.log('Creating Google Sheets for all existing customers...');

    const result = await createSheetsForExistingCustomers();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Bulk creation failed',
        message: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: `Bulk creation completed: ${result.summary.successful} successful, ${result.summary.failed} failed`,
      summary: result.summary,
      results: result.results,
      next_step: 'Visit /api/sheets/customer-sheets to see all created sheets',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Bulk sheet creation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}