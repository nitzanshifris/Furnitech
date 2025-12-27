import { sheetsClient } from '../../lib/google-sheets.js';
import { getAllCustomerSheets } from '../../lib/customer-sheets.js';
import { google } from 'googleapis';

/**
 * Share all customer sheets with a specified email
 * POST /api/sheets/share-with-me
 * Body: { email: "your-email@gmail.com" }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address',
        example: { email: "your-email@gmail.com" }
      });
    }

    console.log(`Sharing all customer sheets with: ${email}`);

    // Get all customer sheets from database
    const sheetsResult = await getAllCustomerSheets();

    if (!sheetsResult.success || sheetsResult.sheets.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No customer sheets found',
        message: 'Please create customer sheets first using /api/sheets/create-all-sheets'
      });
    }

    // Initialize Google Drive API
    await sheetsClient.initialize();
    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ]
    });

    const drive = google.drive({ version: 'v3', auth });

    const results = [];
    let successCount = 0;
    let failCount = 0;

    // Share each sheet with the provided email
    for (const sheet of sheetsResult.sheets) {
      try {
        console.log(`Sharing sheet: ${sheet.sheet_name} (${sheet.google_sheet_id})`);

        await drive.permissions.create({
          fileId: sheet.google_sheet_id,
          requestBody: {
            type: 'user',
            role: 'writer', // or 'reader' for view-only
            emailAddress: email
          },
          fields: 'id'
        });

        results.push({
          customer: sheet.customer_name,
          sheet_name: sheet.sheet_name,
          sheet_url: sheet.sheet_url,
          status: 'shared',
          message: `Shared with ${email}`
        });
        successCount++;

      } catch (error) {
        console.error(`Failed to share sheet ${sheet.sheet_name}:`, error.message);
        results.push({
          customer: sheet.customer_name,
          sheet_name: sheet.sheet_name,
          status: 'failed',
          error: error.message
        });
        failCount++;
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return res.status(200).json({
      success: true,
      message: `Shared ${successCount} sheets with ${email}`,
      summary: {
        total: sheetsResult.sheets.length,
        shared: successCount,
        failed: failCount
      },
      results: results,
      next_step: `Check your email (${email}) for Google Sheets invitations`,
      access_url: 'https://drive.google.com/drive/shared-with-me'
    });

  } catch (error) {
    console.error('Share sheets error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to share sheets',
      message: error.message
    });
  }
}