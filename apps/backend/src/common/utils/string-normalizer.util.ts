/**
 * Utility functions for normalizing strings for comparison
 */

/**
 * Normalize clinic name for comparison
 * Removes extra spaces, special characters, and standardizes format
 */
export function normalizeClinicName(name: string): string {
  if (!name) return "";

  return name
    .trim()
    .replace(/\s+/g, " ") // Multiple spaces to single space
    .replace(/[()]/g, "") // Remove parentheses
    .replace(/[()]/g, "") // Remove brackets
    .toLowerCase();
}

/**
 * Fuzzy match two clinic names
 * Returns true if names are similar enough
 */
export function fuzzyMatchClinicName(
  name1: string,
  name2: string,
  threshold: number = 0.8
): boolean {
  const norm1 = normalizeClinicName(name1);
  const norm2 = normalizeClinicName(name2);

  // Exact match
  if (norm1 === norm2) return true;

  // Check if one contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return true;
  }

  // Simple similarity check
  const words1 = norm1.split(" ");
  const words2 = norm2.split(" ");
  const commonWords = words1.filter((w) => w.length > 1 && words2.includes(w));
  const similarity =
    commonWords.length / Math.max(words1.length, words2.length);

  return similarity >= threshold;
}

/**
 * Normalize clinic type for comparison
 */
export function normalizeClinicType(type: string): string {
  if (!type) return "";

  return type.trim().replace(/\s+/g, "").toLowerCase();
}

/**
 * Compare clinic types
 */
export function compareClinicTypes(type1: string, type2: string): boolean {
  const norm1 = normalizeClinicType(type1);
  const norm2 = normalizeClinicType(type2);

  return norm1 === norm2;
}
