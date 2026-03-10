/**
 * Barcode skaner: Korean (Hangul) belgilarini English (Latin) ga o'giradi.
 * Miracle MQ150 va boshqa USB HID skanerlar Korean klaviatura layoutida
 * belgi yuborganida to'g'ri barcode olish uchun.
 *
 * Misol: "01076401237911901726103010ㅠ00060580" → "01076401237911901726103010B00060580"
 */

/** Korean (Hangul) → English harf jadvali (klaviatura layoutiga mos) */
const KOREAN_TO_ENG: Record<string, string> = {
  ㅂ: "q",
  ㅈ: "w",
  ㄷ: "e",
  ㄱ: "r",
  ㅅ: "t",
  ㅛ: "y",
  ㅕ: "u",
  ㅑ: "i",
  ㅐ: "o",
  ㅔ: "p",
  ㅁ: "a",
  ㄴ: "s",
  ㅇ: "d",
  ㄹ: "f",
  ㅎ: "g",
  ㅗ: "h",
  ㅓ: "j",
  ㅏ: "k",
  ㅣ: "l",
  ㅋ: "z",
  ㅌ: "x",
  ㅊ: "c",
  ㅍ: "v",
  ㅠ: "b",
  ㅜ: "n",
  ㅡ: "m",
  ㅃ: "Q",
  ㅉ: "W",
  ㄸ: "E",
  ㄲ: "R",
  ㅆ: "T",
  ㅒ: "O",
  ㅖ: "P",
};

/**
 * Berilgan matn ichidagi Korean belgilarini English ga o'giradi.
 * Aralash (ENG + Korean) barcode uchun ham ishlatish mumkin.
 */
export function fixBarcodeKoreanToEng(text: string): string {
  if (!text) return "";
  const result: string[] = [];
  for (const char of text) {
    result.push(KOREAN_TO_ENG[char] ?? char);
  }
  return result.join("");
}
