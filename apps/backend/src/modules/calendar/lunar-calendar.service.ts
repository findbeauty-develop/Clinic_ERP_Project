import { Injectable } from "@nestjs/common";

@Injectable()
export class LunarCalendarService {
  // Simplified lunar calendar conversion
  // For production, use libraries like lunar-javascript or korean-lunar-calendar

  lunarToSolar(year: number, month: number, day: number, isLeapMonth = false) {
    // Placeholder implementation
    // Real implementation would use astronomical calculations
    return {
      lunar: { year, month, day, isLeapMonth },
      solar: {
        year,
        month: month + 1,
        day: day + 18,
      },
      note: "This is a simplified conversion. Use a proper lunar calendar library for accurate results.",
    };
  }

  solarToLunar(year: number, month: number, day: number) {
    // Placeholder implementation
    return {
      solar: { year, month, day },
      lunar: {
        year,
        month: month - 1 || 12,
        day: day - 18 > 0 ? day - 18 : day + 12,
        isLeapMonth: false,
      },
      note: "This is a simplified conversion. Use a proper lunar calendar library for accurate results.",
    };
  }

  get24SolarTerms(year: number) {
    // 24 절기 (24 Solar Terms)
    const terms = [
      { name: "입춘", nameEn: "Start of Spring", approxDate: `${year}-02-04` },
      { name: "우수", nameEn: "Rain Water", approxDate: `${year}-02-19` },
      {
        name: "경칩",
        nameEn: "Awakening of Insects",
        approxDate: `${year}-03-05`,
      },
      { name: "춘분", nameEn: "Spring Equinox", approxDate: `${year}-03-20` },
      { name: "청명", nameEn: "Pure Brightness", approxDate: `${year}-04-05` },
      { name: "곡우", nameEn: "Grain Rain", approxDate: `${year}-04-20` },
      { name: "입하", nameEn: "Start of Summer", approxDate: `${year}-05-05` },
      { name: "소만", nameEn: "Grain Buds", approxDate: `${year}-05-21` },
      { name: "망종", nameEn: "Grain in Ear", approxDate: `${year}-06-06` },
      { name: "하지", nameEn: "Summer Solstice", approxDate: `${year}-06-21` },
      { name: "소서", nameEn: "Minor Heat", approxDate: `${year}-07-07` },
      { name: "대서", nameEn: "Major Heat", approxDate: `${year}-07-23` },
      { name: "입추", nameEn: "Start of Autumn", approxDate: `${year}-08-07` },
      { name: "처서", nameEn: "End of Heat", approxDate: `${year}-08-23` },
      { name: "백로", nameEn: "White Dew", approxDate: `${year}-09-08` },
      { name: "추분", nameEn: "Autumn Equinox", approxDate: `${year}-09-23` },
      { name: "한로", nameEn: "Cold Dew", approxDate: `${year}-10-08` },
      { name: "상강", nameEn: "Descent of Frost", approxDate: `${year}-10-23` },
      { name: "입동", nameEn: "Start of Winter", approxDate: `${year}-11-07` },
      { name: "소설", nameEn: "Minor Snow", approxDate: `${year}-11-22` },
      { name: "대설", nameEn: "Major Snow", approxDate: `${year}-12-07` },
      { name: "동지", nameEn: "Winter Solstice", approxDate: `${year}-12-22` },
      { name: "소한", nameEn: "Minor Cold", approxDate: `${year}-01-05` },
      { name: "대한", nameEn: "Major Cold", approxDate: `${year}-01-20` },
    ];

    return { year, solarTerms: terms };
  }
}
