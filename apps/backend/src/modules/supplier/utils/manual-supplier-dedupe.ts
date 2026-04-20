/** Collapses inner whitespace for stable manual-supplier dedupe keys. */
export function normalizeManualSupplierTextForDedupe(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Digits-only mobile key; normalizes 10XXXXXXXX → 010XXXXXXXX when appropriate.
 * Matches clinic manual DTO expectation after validation.
 */
export function normalizeManualSupplierPhoneForDedupe(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("10")) {
    return `0${digits}`;
  }
  return digits.length > 0 ? digits : value.trim();
}
