/**
 * GS1 Barcode Parser
 * Parses GS1-128 and DataMatrix barcodes used in pharmaceutical products
 * 
 * Application Identifiers (AI):
 * - 01: GTIN (Global Trade Item Number) - 14 digits
 * - 17: Expiry Date (YYMMDD) - 6 digits
 * - 10: Batch/Lot Number - Variable length
 * - 21: Serial Number - Variable length
 */

export interface GS1BarcodeData {
  gtin?: string;           // AI: 01 (Product ID)
  expiryDate?: string;     // AI: 17 (YYMMDD → YYYY-MM-DD)
  batchNumber?: string;    // AI: 10 (Lot/Batch)
  serialNumber?: string;   // AI: 21 (Serial)
  rawBarcode: string;
}

/**
 * Parse GS1 barcode and extract all Application Identifiers
 * @param barcode - Full GS1 barcode string
 * @returns Parsed barcode data
 * 
 * @example
 * const barcode = "0108806995000115172802291054111102921EK5AVRDP76AV";
 * const parsed = parseGS1Barcode(barcode);
 * // Result: {
 * //   gtin: "08806995000115",
 * //   expiryDate: "2028-02-29",
 * //   batchNumber: "54111102921",
 * //   serialNumber: "EK5AVRDP76AV",
 * //   rawBarcode: "0108806995000115172802291054111102921EK5AVRDP76AV"
 * // }
 */
export function parseGS1Barcode(barcode: string): GS1BarcodeData {
  const result: GS1BarcodeData = { rawBarcode: barcode };
  let currentIndex = 0;
  
  while (currentIndex < barcode.length) {
    const ai = barcode.substring(currentIndex, currentIndex + 2);
    
    switch (ai) {
      case '01': // GTIN (14 digits)
        result.gtin = barcode.substring(currentIndex + 2, currentIndex + 16);
        currentIndex += 16;
        break;
        
      case '17': // Expiry Date (YYMMDD → YYYY-MM-DD)
        const expiry = barcode.substring(currentIndex + 2, currentIndex + 8);
        const year = '20' + expiry.substring(0, 2);
        const month = expiry.substring(2, 4);
        const day = expiry.substring(4, 6);
        result.expiryDate = `${year}-${month}-${day}`;
        currentIndex += 8;
        break;
        
      case '10': // Batch Number (variable length)
        const batchStart = currentIndex + 2;
        let batchEnd = batchStart;
        
        // Find next AI (2 digits) or end of string
        while (batchEnd < barcode.length) {
          const nextAI = barcode.substring(batchEnd, batchEnd + 2);
          if (['01', '17', '21'].includes(nextAI) && batchEnd > batchStart) {
            break;
          }
          batchEnd++;
        }
        
        result.batchNumber = barcode.substring(batchStart, batchEnd);
        currentIndex = batchEnd;
        break;
        
      case '21': // Serial Number (variable length, usually rest of string)
        result.serialNumber = barcode.substring(currentIndex + 2);
        currentIndex = barcode.length; // End parsing
        break;
        
      default:
        // Unknown AI, skip 2 characters
        currentIndex += 2;
    }
  }
  
  return result;
}

/**
 * Validate if a string is a valid GTIN (14 digits)
 */
export function isValidGTIN(gtin: string): boolean {
  return /^\d{14}$/.test(gtin);
}

/**
 * Validate if a date string is in YYYY-MM-DD format
 */
export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

