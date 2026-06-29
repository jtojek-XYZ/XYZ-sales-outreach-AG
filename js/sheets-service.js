/**
 * XYZ Sales Outreach - Google Sheets Service
 * 
 * Interacts with the Google Sheets API v4 to fetch spreadsheet data.
 * Includes spreadsheet URL parsing, auto-detecting sheet names,
 * and a robust mock dataset for Mock Mode.
 */

import { GoogleAuth } from './google-auth.js';
import { CSVParser } from './csv-parser.js';

export class GoogleSheetsService {
  /**
   * Helper to extract Spreadsheet ID from a standard Google Sheets URL.
   * Handles various URL shapes.
   */
  static extractSpreadsheetId(urlOrId) {
    if (!urlOrId) return '';
    const trimmed = urlOrId.trim();
    if (!trimmed.startsWith('http')) return trimmed; // Assume it's already an ID

    const matches = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return matches ? matches[1] : '';
  }

  /**
   * Fetches data rows from the first sheet of the specified Google Spreadsheet.
   */
  static async fetchSheetData(spreadsheetUrlOrId) {
    if (GoogleAuth.isMockMode()) {
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrlOrId);
      if (spreadsheetId && spreadsheetUrlOrId.trim().startsWith('http')) {
        try {
          const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
          const response = await fetch(csvUrl);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const csvText = await response.text();
          
          // Check if we got redirected to a login page (HTML) instead of a CSV
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/html') || csvText.trim().startsWith('<!') || csvText.trim().startsWith('<html')) {
            throw new Error('Spreadsheet is private or requires Google Sign-In.');
          }

          const records = CSVParser.parse(csvText);
          if (records && records.length > 0) {
            return records;
          } else {
            throw new Error('No client records found in the spreadsheet.');
          }
        } catch (error) {
          console.warn('Failed to fetch public spreadsheet CSV directly. Falling back to mock data.', error);
          alert(
            `Notice: Could not directly fetch this Google Sheet in offline Mock Mode.\n\n` +
            `Reason: ${error.message || 'Network error'}\n\n` +
            `How to fix this for Mock Mode:\n` +
            `1. Make sure your Google Sheet is shared as "Anyone with the link can view" (Viewer access is sufficient).\n` +
            `2. Or, go to File > Download > Comma Separated Values (.csv) in Google Sheets, and drag-and-drop the downloaded file directly into our Campaign Creator!\n` +
            `3. Or, once your administrator (Jim) configures the Google Client ID in Workspace Configuration (Settings), you can sign in to access private sheets securely.\n\n` +
            `Fallback: Loading the standard offline demo contacts instead.`
          );
          return this.getMockSheetData();
        }
      }
      return this.getMockSheetData();
    }

    const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrlOrId);
    if (!spreadsheetId) {
      throw new Error('Could not parse Google Spreadsheet ID. Please check the URL.');
    }

    const token = GoogleAuth.getToken();
    if (!token) {
      throw new Error('Google OAuth Token not found. Please sign in first.');
    }

    try {
      // Step 1: Fetch spreadsheet metadata to discover the first sheet name
      const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
      const metaResponse = await fetch(metaUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!metaResponse.ok) {
        const err = await metaResponse.json();
        throw new Error(err.error?.message || 'Failed to fetch spreadsheet metadata.');
      }

      const metaData = await metaResponse.json();
      const sheets = metaData.sheets;
      if (!sheets || sheets.length === 0) {
        throw new Error('Spreadsheet contains no sheets.');
      }

      const firstSheetName = sheets[0].properties.title;

      // Step 2: Fetch cell values from A to Z of the first sheet
      const range = `${encodeURIComponent(firstSheetName)}!A:Z`;
      const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
      const valuesResponse = await fetch(valuesUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!valuesResponse.ok) {
        const err = await valuesResponse.json();
        throw new Error(err.error?.message || 'Failed to fetch spreadsheet cell values.');
      }

      const valuesData = await valuesResponse.json();
      const rows = valuesData.values;

      if (!rows || rows.length < 2) {
        throw new Error('Spreadsheet has no data (requires at least a header row and one prospect row).');
      }

      return this.parseSheetRows(rows);

    } catch (error) {
      console.error('Google Sheets API Error:', error);
      throw error;
    }
  }

  /**
   * Translates 2D Sheet API grid rows (headers + cells) into a clean list of prospects.
   */
  static parseSheetRows(rows) {
    const headers = rows[0].map(h => h ? h.trim() : '');
    
    // Find index of email field
    const emailIndex = headers.findIndex(h => 
      h.toLowerCase() === 'email' || 
      h.toLowerCase() === 'e-mail' || 
      h.toLowerCase() === 'email address'
    );

    const prospects = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const record = {
        email: '',
        variables: {}
      };

      headers.forEach((header, index) => {
        if (!header) return;
        const value = row[index] ? row[index].trim() : '';
        if (index === emailIndex) {
          record.email = value;
        }
        // Save everything as variables
        record.variables[header] = value;
      });

      if (record.email) {
        prospects.push(record);
      }
    }

    return prospects;
  }

  /**
   * Generates mock prospect data for demonstration / offline dry-run testing.
   */
  static getMockSheetData() {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          {
            email: 'john.miller@quantumtech.io',
            variables: {
              'Email': 'john.miller@quantumtech.io',
              'First Name': 'John',
              'Last Name': 'Miller',
              'Company': 'Quantum Tech',
              'ServiceOfInterest': 'SEO Optimization & Brand Redesign',
              'Role': 'Marketing Director'
            }
          },
          {
            email: 'sarah.connor@apexretail.co',
            variables: {
              'Email': 'sarah.connor@apexretail.co',
              'First Name': 'Sarah',
              'Last Name': 'Connor',
              'Company': 'Apex Retail Group',
              'ServiceOfInterest': 'Google Ads Strategy',
              'Role': 'VP of Growth'
            }
          },
          {
            email: 'david.b@luminasystems.com',
            variables: {
              'Email': 'david.b@luminasystems.com',
              'First Name': 'David',
              'Last Name': 'Beckham',
              'Company': 'Lumina Systems',
              'ServiceOfInterest': 'Social Media Advertising',
              'Role': 'Founder & CEO'
            }
          },
          {
            email: 'elena.rodriguez@vanguarddesign.net',
            variables: {
              'Email': 'elena.rodriguez@vanguarddesign.net',
              'First Name': 'Elena',
              'Last Name': 'Rodriguez',
              'Company': 'Vanguard Design',
              'ServiceOfInterest': 'Comprehensive Performance Marketing',
              'Role': 'Chief Design Officer'
            }
          }
        ]);
      }, 800); // Small delay to feel like a real API network fetch
    });
  }
}
