/**
 * Utility functions for normalizing and comparing Korean addresses
 */

/**
 * Normalize Korean address for comparison
 * Removes extra spaces, standardizes format
 */
export function normalizeAddress(address: string): string {
  if (!address) return "";

  return address
    .trim()
    .replace(/\s+/g, " ") // Multiple spaces to single space
    .replace(/서울시/g, "서울특별시")
    .replace(/부산시/g, "부산광역시")
    .replace(/대구시/g, "대구광역시")
    .replace(/인천시/g, "인천광역시")
    .replace(/광주시/g, "광주광역시")
    .replace(/대전시/g, "대전광역시")
    .replace(/울산시/g, "울산광역시")
    .toLowerCase();
}

/**
 * Extract 시도코드 (Sido Code) from address
 * Returns code like "11" for 서울특별시
 */
export function extractSidoCode(address: string): string | null {
  if (!address) return null;

  const normalized = address.toLowerCase();

  // Common 시도 codes (simplified - full list would be longer)
  const sidoMap: Record<string, string> = {
    서울특별시: "11",
    서울시: "11",
    부산광역시: "26",
    부산시: "26",
    대구광역시: "27",
    대구시: "27",
    인천광역시: "28",
    인천시: "28",
    광주광역시: "29",
    광주시: "29",
    대전광역시: "30",
    대전시: "30",
    울산광역시: "31",
    울산시: "31",
    세종특별자치시: "36",
    세종시: "36",
    경기도: "41",
    강원도: "42",
    충청북도: "43",
    충청남도: "44",
    전라북도: "45",
    전라남도: "46",
    경상북도: "47",
    경상남도: "48",
    제주특별자치도: "50",
    제주도: "50",
  };

  for (const [sido, code] of Object.entries(sidoMap)) {
    if (normalized.includes(sido.toLowerCase())) {
      return code;
    }
  }

  return null;
}

/**
 * Extract 시군구코드 (Sigungu Code) from address
 * This is more complex and may require a full database
 * For now, returns null - can be enhanced later
 */
export function extractSgguCode(address: string): string | null {
  // This would require a full database of 시군구 codes
  // For now, return null - can be enhanced with actual data
  return null;
}

/**
 * Extract 읍면동명 (Eup/Myeon/Dong Name) from address
 * Usually found in parentheses at the end: (반포동)
 * Example: "서울특별시 서초구 강남대로 527, 브랜드칸 타워 5층 (반포동)" -> "반포동"
 */
export function extractEmdongNm(address: string): string | null {
  if (!address) return null;

  // Pattern: (동이름) at the end of address
  // Examples: (반포동), (서초동), (강남동)
  const match = address.match(/\(([가-힣]+동)\)/);
  if (match && match[1]) {
    return match[1];
  }

  // Alternative pattern: try to find 동 at the end without parentheses
  // This is less common but might occur
  const words = address.split(/\s+/);
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].endsWith("동") && words[i].length <= 5) {
      // Remove any trailing punctuation
      return words[i].replace(/[.,)]+$/, "");
    }
  }

  return null;
}

/**
 * Compare two addresses with fuzzy matching
 * Returns true if addresses are similar enough
 */
export function compareAddresses(
  address1: string,
  address2: string,
  threshold: number = 0.7
): boolean {
  const norm1 = normalizeAddress(address1);
  const norm2 = normalizeAddress(address2);

  // Exact match
  if (norm1 === norm2) return true;

  // Check if one contains the other (for partial matches)
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return true;
  }

  // Simple similarity check (can be enhanced with Levenshtein distance)
  const words1 = norm1.split(" ");
  const words2 = norm2.split(" ");
  const commonWords = words1.filter((w) => words2.includes(w));
  const similarity =
    commonWords.length / Math.max(words1.length, words2.length);

  return similarity >= threshold;
}
