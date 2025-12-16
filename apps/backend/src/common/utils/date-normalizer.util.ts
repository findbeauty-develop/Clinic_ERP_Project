/**
 * Utility functions for normalizing and comparing dates
 */

/**
 * Normalize date to YYYYMMDD format
 * Handles various input formats:
 * - "2020-09-04" -> "20200904"
 * - "2020년 09월 04일" -> "20200904"
 * - "20200904" -> "20200904"
 */
export function normalizeDate(date: string): string | null {
  if (!date) return null;
  
  // Remove all non-digit characters except dashes
  let cleaned = date.replace(/[^\d-]/g, '');
  
  // Try to extract YYYYMMDD format
  const match = cleaned.match(/(\d{4})[-]?(\d{2})[-]?(\d{2})/);
  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${year}${month}${day}`;
  }
  
  // Try YYYYMMDD format (8 digits)
  const eightDigitMatch = cleaned.match(/^(\d{8})$/);
  if (eightDigitMatch) {
    return eightDigitMatch[1];
  }
  
  return null;
}

/**
 * Compare two dates
 * Returns true if dates match (within same day)
 */
export function compareDates(date1: string, date2: string): boolean {
  const norm1 = normalizeDate(date1);
  const norm2 = normalizeDate(date2);
  
  if (!norm1 || !norm2) return false;
  
  return norm1 === norm2;
}

/**
 * Format date to YYYY-MM-DD for display
 */
export function formatDateForDisplay(date: string): string | null {
  const normalized = normalizeDate(date);
  if (!normalized || normalized.length !== 8) return null;
  
  const year = normalized.substring(0, 4);
  const month = normalized.substring(4, 6);
  const day = normalized.substring(6, 8);
  
  return `${year}-${month}-${day}`;
}

