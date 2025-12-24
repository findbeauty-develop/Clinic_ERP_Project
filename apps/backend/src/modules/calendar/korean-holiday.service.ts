import { Injectable } from "@nestjs/common";

export interface Holiday {
  name: string;
  nameEn: string;
  date: Date;
  type: "public" | "lunar" | "solar";
}

@Injectable()
export class KoreanHolidayService {
  getHolidays(year: number): Holiday[] {
    const holidays: Holiday[] = [];

    // Fixed solar holidays
    holidays.push(
      {
        name: "새해",
        nameEn: "New Year's Day",
        date: new Date(year, 0, 1),
        type: "solar",
      },
      {
        name: "삼일절",
        nameEn: "Independence Movement Day",
        date: new Date(year, 2, 1),
        type: "solar",
      },
      {
        name: "어린이날",
        nameEn: "Children's Day",
        date: new Date(year, 4, 5),
        type: "solar",
      },
      {
        name: "현충일",
        nameEn: "Memorial Day",
        date: new Date(year, 5, 6),
        type: "solar",
      },
      {
        name: "광복절",
        nameEn: "Liberation Day",
        date: new Date(year, 7, 15),
        type: "solar",
      },
      {
        name: "개천절",
        nameEn: "National Foundation Day",
        date: new Date(year, 9, 3),
        type: "solar",
      },
      {
        name: "한글날",
        nameEn: "Hangeul Day",
        date: new Date(year, 9, 9),
        type: "solar",
      },
      {
        name: "크리스마스",
        nameEn: "Christmas",
        date: new Date(year, 11, 25),
        type: "solar",
      }
    );

    // Lunar holidays (approximate - actual dates vary by lunar calendar)
    // Seollal (Lunar New Year) - typically Jan/Feb
    // Chuseok (Harvest Festival) - typically Sep/Oct
    // Buddha's Birthday - typically May

    // For demo purposes, adding placeholders
    // In production, use a proper lunar calendar library
    holidays.push(
      {
        name: "설날",
        nameEn: "Lunar New Year",
        date: new Date(year, 1, 10),
        type: "lunar",
      },
      {
        name: "석가탄신일",
        nameEn: "Buddha's Birthday",
        date: new Date(year, 4, 15),
        type: "lunar",
      },
      {
        name: "추석",
        nameEn: "Chuseok",
        date: new Date(year, 8, 17),
        type: "lunar",
      }
    );

    return holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
