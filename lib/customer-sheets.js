import { sheetsClient } from './google-sheets.js';
import { supabase } from './supabase.js';

/**
 * Customer Sheet Management Library
 * Handles creation and management of customer-specific Google Sheets
 */

/**
 * Create a new Google Sheet for a customer
 * @param {string} customerId - Customer identifier
 * @param {string} customerName - Customer display name
 * @returns {Object} - Creation result with sheet details
 */
export async function createCustomerSheet(customerId, customerName) {
  try {
    console.log(`Creating Google Sheet for customer: ${customerName} (${customerId})`);

    // Check if customer already has a sheet
    const existingSheet = await getCustomerSheet(customerId);
    if (existingSheet.success && existingSheet.sheet) {
      console.log(`Customer ${customerId} already has a sheet: ${existingSheet.sheet.google_sheet_id}`);
      return {
        success: true,
        sheet: existingSheet.sheet,
        message: 'Customer sheet already exists'
      };
    }

    // Create the Google Sheet
    const sheetName = `${customerName} - AR Products`;
    const sheetResult = await createGoogleSpreadsheet(sheetName);

    if (!sheetResult.success) {
      throw new Error(`Failed to create Google Sheet: ${sheetResult.error}`);
    }

    // Set up the sheet with headers using the same auth
    const headers = ['Customer', 'Name', 'SKU', 'AR_View_Link', 'QR_Code_SVG'];

    // Use the sheets API directly with proper auth
    const { google } = await import('googleapis');
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
        'https://www.googleapis.com/auth/drive.file'
      ]
    });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetResult.spreadsheetId,
        range: 'Sheet1!A1:E1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers]
        }
      });
      console.log('Headers written successfully');
    } catch (headerError) {
      console.warn('Failed to write headers, but sheet was created:', headerError.message);
    }


    // Save to database
    const dbResult = await saveCustomerSheetToDatabase({
      customerId,
      customerName,
      googleSheetId: sheetResult.spreadsheetId,
      sheetUrl: sheetResult.url,
      sheetName
    });

    if (!dbResult.success) {
      console.error('Sheet created but failed to save to database:', dbResult.error);
      // Continue anyway - sheet exists even if not tracked
    }

    console.log(`Successfully created sheet for ${customerName}: ${sheetResult.spreadsheetId}`);

    return {
      success: true,
      sheet: {
        google_sheet_id: sheetResult.spreadsheetId,
        sheet_url: sheetResult.url,
        sheet_name: sheetName,
        customer_id: customerId,
        customer_name: customerName,
        created_at: new Date().toISOString(),
        sync_status: 'created'
      },
      message: 'Customer sheet created successfully'
    };

  } catch (error) {
    console.error('Error creating customer sheet:', error);
    return {
      success: false,
      error: error.message,
      sheet: null
    };
  }
}

/**
 * Create a new Google Spreadsheet using the Sheets API
 * @param {string} title - Spreadsheet title
 * @returns {Object} - Creation result
 */
async function createGoogleSpreadsheet(title) {
  try {
    // Initialize with Drive permissions for creating sheets
    const { google } = await import('googleapis');

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
        'https://www.googleapis.com/auth/drive.file'
      ]
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: title
        },
        sheets: [{
          properties: {
            title: 'Sheet1',
            gridProperties: {
              rowCount: 1000,
              columnCount: 10
            }
          }
        }]
      }
    });

    const spreadsheetId = response.data.spreadsheetId;
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    return {
      success: true,
      spreadsheetId,
      url,
      title
    };

  } catch (error) {
    console.error('Failed to create Google Spreadsheet:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Save customer sheet details to database
 * @param {Object} sheetData - Sheet information to save
 * @returns {Object} - Save result
 */
async function saveCustomerSheetToDatabase(sheetData) {
  try {
    const { data, error } = await supabase
      .from('customer_sheets')
      .insert([{
        customer_id: sheetData.customerId,
        customer_name: sheetData.customerName,
        google_sheet_id: sheetData.googleSheetId,
        sheet_url: sheetData.sheetUrl,
        sheet_name: sheetData.sheetName,
        sync_status: 'created',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data
    };

  } catch (error) {
    console.error('Database save error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get customer sheet information from database
 * @param {string} customerId - Customer identifier
 * @returns {Object} - Sheet information
 */
export async function getCustomerSheet(customerId) {
  try {
    const { data, error } = await supabase
      .from('customer_sheets')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        return {
          success: true,
          sheet: null,
          message: 'No sheet found for customer'
        };
      }
      throw error;
    }

    return {
      success: true,
      sheet: data
    };

  } catch (error) {
    console.error('Error getting customer sheet:', error);
    return {
      success: false,
      error: error.message,
      sheet: null
    };
  }
}

/**
 * Get all customer sheets
 * @returns {Object} - All customer sheets
 */
export async function getAllCustomerSheets() {
  try {
    const { data, error } = await supabase
      .from('customer_sheets')
      .select('*')
      .eq('is_active', true)
      .order('customer_name');

    if (error) {
      throw error;
    }

    return {
      success: true,
      sheets: data || []
    };

  } catch (error) {
    console.error('Error getting all customer sheets:', error);
    return {
      success: false,
      error: error.message,
      sheets: []
    };
  }
}

/**
 * Update customer sheet sync status
 * @param {string} customerId - Customer identifier
 * @param {Object} syncData - Sync information
 * @returns {Object} - Update result
 */
export async function updateCustomerSheetSync(customerId, syncData) {
  try {
    const { data, error } = await supabase
      .from('customer_sheets')
      .update({
        last_synced: new Date().toISOString(),
        sync_status: syncData.status || 'synced',
        product_count: syncData.productCount || 0,
        variant_count: syncData.variantCount || 0,
        error_message: syncData.errorMessage || null
      })
      .eq('customer_id', customerId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data
    };

  } catch (error) {
    console.error('Error updating sync status:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create sheets for all existing customers who don't have them
 * @returns {Object} - Bulk creation result
 */
export async function createSheetsForExistingCustomers() {
  try {
    console.log('Creating sheets for existing customers...');

    // Get all unique customers from models table
    const { data: customers, error } = await supabase
      .from('models')
      .select('customer_id, customer_name')
      .not('customer_id', 'eq', 'unassigned')
      .not('customer_name', 'eq', 'Unassigned');

    if (error) {
      throw error;
    }

    // Get unique customers
    const uniqueCustomers = customers.reduce((acc, model) => {
      if (!acc.find(c => c.customer_id === model.customer_id)) {
        acc.push({
          customer_id: model.customer_id,
          customer_name: model.customer_name
        });
      }
      return acc;
    }, []);

    console.log(`Found ${uniqueCustomers.length} unique customers`);

    const results = [];
    for (const customer of uniqueCustomers) {
      const result = await createCustomerSheet(customer.customer_id, customer.customer_name);
      results.push({
        customer: customer.customer_name,
        result
      });

      // Add small delay to avoid API rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const successful = results.filter(r => r.result.success).length;
    const failed = results.filter(r => !r.result.success).length;

    return {
      success: true,
      results,
      summary: {
        total: uniqueCustomers.length,
        successful,
        failed
      }
    };

  } catch (error) {
    console.error('Error creating sheets for existing customers:', error);
    return {
      success: false,
      error: error.message
    };
  }
}