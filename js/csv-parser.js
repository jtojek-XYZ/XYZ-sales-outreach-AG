/**
 * XYZ Sales Outreach - Client-side CSV Parser
 * 
 * Implements a robust RFC 4180-compliant CSV parser to handle quotes,
 * commas within quoted fields, escaped double quotes, and trailing empty lines.
 */

export class CSVParser {
  /**
   * Parses CSV text into an array of objects based on header row.
   * @param {string} text - Raw CSV content
   * @returns {Array<Object>} - Decoded records
   */
  static parse(text) {
    if (!text || !text.trim()) return [];

    const lines = this.parseToRows(text);
    if (lines.length < 2) return [];

    // Clean headers: trim whitespace and remove surrounding quotes/BOM if present
    const headers = lines[0].map(h => this.cleanField(h));
    
    // Find index of email field (essential for campaigns)
    const emailIndex = headers.findIndex(h => 
      h.toLowerCase() === 'email' || 
      h.toLowerCase() === 'e-mail' || 
      h.toLowerCase() === 'email address'
    );

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      // Skip empty or mismatching length rows (usually trailing blank lines)
      if (row.length === 0 || (row.length === 1 && !row[0])) continue;

      const record = {
        email: '',
        variables: {}
      };

      headers.forEach((header, index) => {
        const value = this.cleanField(row[index] || '');
        if (index === emailIndex) {
          record.email = value.trim();
        }
        // Save everything as variables for custom template expansion
        record.variables[header] = value;
      });

      // Normalize or extract 'First Name' for ease of template use
      const varKeys = Object.keys(record.variables);
      const existingFirstNameKey = varKeys.find(k => k.toLowerCase().replace(/[\s_-]/g, '') === 'firstname');
      
      if (existingFirstNameKey && record.variables[existingFirstNameKey]) {
        // If they had a first name column with a different casing/spacing, normalize it to 'First Name'
        if (existingFirstNameKey !== 'First Name') {
          record.variables['First Name'] = record.variables[existingFirstNameKey];
        }
      } else {
        // No explicit first name found. Try to extract from a general name column
        const nameKey = varKeys.find(k => {
          const lk = k.toLowerCase().replace(/[\s_-]/g, '');
          return lk === 'name' || lk === 'fullname' || lk === 'recipientname' || lk === 'prospectname';
        });
        if (nameKey && record.variables[nameKey]) {
          const nameVal = record.variables[nameKey].trim();
          if (nameVal) {
            // Get the first word of the name
            const firstWord = nameVal.split(/\s+/)[0];
            record.variables['First Name'] = firstWord;
          }
        }
      }

      if (record.email) {
        records.push(record);
      }
    }

    return records;
  }

  /**
   * Parses CSV text into rows of raw string elements.
   * Handles commas inside quotes and escaped quotes.
   */
  static parseToRows(text) {
    const rows = [];
    let row = [];
    let currentField = '';
    let inQuotes = false;

    // Normalize newlines
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < normalizedText.length; i++) {
      const char = normalizedText[i];
      const nextChar = normalizedText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote: "" inside quotes resolves to a single "
          currentField += '"';
          i++; // Skip the next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        row.push(currentField);
        currentField = '';
      } else if (char === '\n' && !inQuotes) {
        // End of row
        row.push(currentField);
        rows.push(row);
        row = [];
        currentField = '';
      } else {
        // Regular character
        currentField += char;
      }
    }

    // Push last field and row if remaining
    if (currentField || row.length > 0) {
      row.push(currentField);
      rows.push(row);
    }

    return rows;
  }

  /**
   * Cleans a parsed field by trimming outer whitespace and standardizing quotes.
   */
  static cleanField(field) {
    let clean = field.trim();
    // Remove BOM character if present (from Excel CSV exports)
    if (clean.charCodeAt(0) === 0xFEFF) {
      clean = clean.substring(1);
    }
    // Remove outer quotes if they exist
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.substring(1, clean.length - 1);
    }
    return clean.replace(/""/g, '"').trim();
  }
}
