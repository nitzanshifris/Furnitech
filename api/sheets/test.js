import { sheetsClient } from '../../lib/google-sheets.js';

/**
 * Test endpoint for Google Sheets authentication and basic operations
 * GET /api/sheets/test
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Testing Google Sheets connection...');

    // Test 1: Basic connection
    const connectionTest = await sheetsClient.testConnection();

    if (!connectionTest.success) {
      return res.status(500).json({
        success: false,
        error: 'Connection failed',
        details: connectionTest.error
      });
    }

    // Test 2: Read current sheet data
    const readTest = await sheetsClient.readRange('Sheet1!A1:D10');

    // Test 3: Check environment variables (without exposing secrets)
    const envCheck = {
      GOOGLE_PROJECT_ID: !!process.env.GOOGLE_PROJECT_ID,
      GOOGLE_PRIVATE_KEY_ID: !!process.env.GOOGLE_PRIVATE_KEY_ID,
      GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
      GOOGLE_CLIENT_EMAIL: !!process.env.GOOGLE_CLIENT_EMAIL,
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_SHEET_ID: !!process.env.GOOGLE_SHEET_ID
    };

    return res.status(200).json({
      success: true,
      message: 'Google Sheets integration working!',
      connection: {
        title: connectionTest.title,
        sheets: connectionTest.sheets
      },
      currentData: {
        rows: readTest.data?.length || 0,
        hasHeaders: readTest.data?.length > 0 && readTest.data[0]?.includes('Name'),
        preview: readTest.data?.slice(0, 3) || []
      },
      environment: {
        variablesPresent: envCheck,
        allVariablesConfigured: Object.values(envCheck).every(Boolean)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Sheets test endpoint error:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}