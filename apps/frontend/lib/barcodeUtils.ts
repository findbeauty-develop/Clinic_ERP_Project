/**
 * Barcode Scanner Utilities
 * Helper functions for parsing and handling barcodes
 */

/**
 * GS1 Barcode Parsed Data
 */
export interface GS1BarcodeData {
  gtin?: string;           // (01) Global Trade Item Number (14 digits)
  lot?: string;            // (10) Batch/Lot Number
  expiry?: string;         // (17) Expiration Date (YYMMDD)
  serialNumber?: string;   // (21) Serial Number
  quantity?: string;       // (30) Variable Count
  raw: string;             // Original barcode
}

/**
 * Parse GS1 barcode format
 * Format: (AI)data(AI)data...
 * Example: (01)12345678901234(10)LOT123(17)250630
 */
export function parseGS1Barcode(barcode: string): GS1BarcodeData {
  const result: GS1BarcodeData = {
    raw: barcode,
  };

  // GTIN (01) - 14 digits
  const gtinMatch = barcode.match(/\(01\)(\d{14})/);
  if (gtinMatch) {
    result.gtin = gtinMatch[1];
  }

  // Batch/Lot Number (10) - alphanumeric, max 20 chars (lowercase qabul qilib uppercase qaytaramiz)
  const lotMatch = barcode.match(/\(10\)([A-Za-z0-9\-]+?)(?:\(|$)/);
  if (lotMatch) {
    result.lot = lotMatch[1].toUpperCase();
  }

  // Expiration Date (17) - YYMMDD format
  const expiryMatch = barcode.match(/\(17\)(\d{6})/);
  if (expiryMatch) {
    result.expiry = expiryMatch[1];
  }

  // Serial Number (21) - alphanumeric, max 20 chars (lowercase qabul qilib uppercase qaytaramiz)
  const serialMatch = barcode.match(/\(21\)([A-Za-z0-9\-]+?)(?:\(|$)/);
  if (serialMatch) {
    result.serialNumber = serialMatch[1].toUpperCase();
  }

  // Quantity (30) - variable count
  const quantityMatch = barcode.match(/\(30\)(\d+)/);
  if (quantityMatch) {
    result.quantity = quantityMatch[1];
  }

  return result;
}

/**
 * Format GS1 expiry date (YYMMDD) to readable format
 * Example: "250630" → "2025-06-30"
 */
export function formatGS1ExpiryDate(yymmdd: string): string | null {
  if (!yymmdd || yymmdd.length !== 6) return null;

  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = yymmdd.substring(2, 4);
  const dd = yymmdd.substring(4, 6);

  // Assume 20xx for years 00-99
  const year = 2000 + yy;

  return `${year}-${mm}-${dd}`;
}

/**
 * Validate barcode length
 */
export function isValidBarcodeLength(barcode: string, minLen: number = 6): boolean {
  return barcode.length >= minLen;
}

/**
 * Extract LOT number from various barcode formats
 */
export function extractLotNumber(barcode: string): string | null {
  // Try GS1 format first
  const gs1 = parseGS1Barcode(barcode);
  if (gs1.lot) return gs1.lot;

  // Try simple pattern: LOT-XXX or LOTXXX
  const lotMatch = barcode.match(/LOT[-]?([A-Z0-9]+)/i);
  if (lotMatch) return lotMatch[1].toUpperCase();

  // Fallback: return entire barcode
  return barcode;
}

/**
 * Show toast notification (for scan feedback)
 */
export function showScanToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
  // Check if toast library exists (e.g., react-hot-toast, sonner)
  if (typeof window !== 'undefined' && (window as any).toast) {
    const toast = (window as any).toast;
    toast[type](message);
  } else {
    // Fallback: console log
    console.log(`[${type.toUpperCase()}]`, message);
  }
}

/**
 * Play scan sound (optional feedback)
 */
export function playScanSound(): void {
  if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGe67eedTQ4LUKrh8LhlGwU4kdXz03osBS1+yPDajz8JFF60 6OunVBMKRZ7d8r9rIQUqf83y2ogzBxhnuu/pnEwPCk2p4e+4YxwGN5HU89V6LAUtfsrw2o8+CRRetefrp1QUCkSe3/K8aiEGKYDN8tiHMwgZZ7rv6pwMD');
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Ignore autoplay errors
      });
    } catch (error) {
      // Ignore audio errors
    }
  }
}
