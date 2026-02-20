/**
 * GS1 Validators
 */

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
