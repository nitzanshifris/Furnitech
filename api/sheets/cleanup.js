import { sheetsClient } from '../../lib/google-sheets.js';

/**
 * Clean up and reset Google Sheets - removes all data and recreates clean structure
 * GET /api/sheets/cleanup
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    console.log('Starting Google Sheets cleanup...');

    await sheetsClient.initialize();

    // Get all sheets in the spreadsheet
    const response = await sheetsClient.sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID
    });

    const sheets = response.data.sheets || [];
    console.log(`Found ${sheets.length} sheets to clean up`);

    // Keep track of what we clean up
    const cleanupResults = [];

    // Clean up each sheet
    for (const sheet of sheets) {
      const sheetName = sheet.properties.title;

      try {
        // Clear all content in the sheet
        await sheetsClient.clearRange(`${sheetName}!A:Z`);

        // Add headers if it's not Sheet1/Master
        if (sheetName !== 'Sheet1' && sheetName !== 'Master') {
          const headers = [['Customer', 'Name', 'SKU', 'AR_View_Link', 'QR_Code_SVG']];
          await sheetsClient.writeRange(`${sheetName}!A1:E1`, headers);
        }

        cleanupResults.push({
          sheet: sheetName,
          status: 'cleaned',
          action: 'cleared_all_data'
        });

        console.log(`✅ Cleaned sheet: ${sheetName}`);
      } catch (error) {
        console.error(`❌ Failed to clean sheet ${sheetName}:`, error.message);
        cleanupResults.push({
          sheet: sheetName,
          status: 'error',
          error: error.message
        });
      }
    }

    // Ensure Master sheet has proper headers
    try {
      const headers = [['Customer', 'Name', 'SKU', 'AR_View_Link', 'QR_Code_SVG']];
      await sheetsClient.writeRange('Master!A1:E1', headers);
      console.log('✅ Added headers to Master sheet');
    } catch (error) {
      console.log('ℹ️ Master sheet header setup skipped (might not exist yet)');
    }

    return res.status(200).json({
      success: true,
      message: 'Google Sheets cleaned up successfully',
      summary: {
        totalSheets: sheets.length,
        cleanedSheets: cleanupResults.filter(r => r.status === 'cleaned').length,
        errors: cleanupResults.filter(r => r.status === 'error').length
      },
      results: cleanupResults,
      nextStep: 'Use Export Data button to create fresh, clean data'
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      message: error.message
    });
  }
}