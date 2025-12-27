import { google } from 'googleapis';

/**
 * Google Sheets API Client
 * Handles authentication and basic operations
 */
class GoogleSheetsClient {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
    this.initialized = false;
  }

  /**
   * Initialize Google Sheets API client with service account authentication
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Validate required environment variables
      const requiredVars = [
        'GOOGLE_PROJECT_ID',
        'GOOGLE_PRIVATE_KEY_ID',
        'GOOGLE_PRIVATE_KEY',
        'GOOGLE_CLIENT_EMAIL',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_SHEET_ID'
      ];

      for (const varName of requiredVars) {
        if (!process.env[varName]) {
          throw new Error(`Missing required environment variable: ${varName}`);
        }
      }

      // Create service account credentials
      const credentials = {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle escaped newlines
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
      };

      // Initialize Google Auth with both Sheets and Drive scopes
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file' // Required for creating new sheets
        ]
      });

      // Create Sheets API client
      this.sheets = google.sheets({ version: 'v4', auth });
      this.initialized = true;

      console.log('Google Sheets client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Google Sheets client:', error);
      throw error;
    }
  }

  /**
   * Test connection to Google Sheets
   */
  async testConnection() {
    await this.initialize();

    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });

      return {
        success: true,
        title: response.data.properties.title,
        sheets: response.data.sheets.map(sheet => sheet.properties.title)
      };
    } catch (error) {
      console.error('Google Sheets connection test failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Read data from a sheet range
   */
  async readRange(range = 'Sheet1!A:Z') {
    await this.initialize();

    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: range
      });

      return {
        success: true,
        data: response.data.values || []
      };
    } catch (error) {
      console.error('Failed to read sheet range:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Write data to a sheet range
   */
  async writeRange(range, values, customSpreadsheetId = null) {
    await this.initialize();

    const targetSpreadsheetId = customSpreadsheetId || this.spreadsheetId;

    try {
      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: targetSpreadsheetId,
        range: range,
        valueInputOption: 'USER_ENTERED', // Allows formulas and formatting
        requestBody: {
          values: values
        }
      });

      return {
        success: true,
        updatedCells: response.data.updatedCells,
        updatedRows: response.data.updatedRows
      };
    } catch (error) {
      console.error('Failed to write to sheet:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Append data to a sheet
   */
  async appendRows(range, values) {
    await this.initialize();

    try {
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: values
        }
      });

      return {
        success: true,
        updatedRange: response.data.updates.updatedRange,
        updatedRows: response.data.updates.updatedRows
      };
    } catch (error) {
      console.error('Failed to append to sheet:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clear a range in the sheet
   */
  async clearRange(range) {
    await this.initialize();

    try {
      const response = await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: range
      });

      return {
        success: true,
        clearedRange: response.data.clearedRange
      };
    } catch (error) {
      console.error('Failed to clear sheet range:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
export const sheetsClient = new GoogleSheetsClient();

// Export class for testing
export { GoogleSheetsClient };