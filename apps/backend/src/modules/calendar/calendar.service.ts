import { Injectable } from "@nestjs/common";
import { KoreanHolidayService, Holiday } from "./korean-holiday.service";
import { LunarCalendarService } from "./lunar-calendar.service";

@Injectable()
export class CalendarService {
  constructor(
    private readonly holidayService: KoreanHolidayService,
    private readonly lunarService: LunarCalendarService
  ) {}

  getYearlyHolidays(year: number): { year: number; holidays: Holiday[] } {
    return {
      year,
      holidays: this.holidayService.getHolidays(year),
    };
  }

  getMonthlyHolidays(
    year: number,
    month: number
  ): { year: number; month: number; holidays: Holiday[] } {
    const allHolidays = this.holidayService.getHolidays(year);
    const monthHolidays = allHolidays.filter(
      (h) => h.date.getMonth() + 1 === month
    );
    return {
      year,
      month,
      holidays: monthHolidays,
    };
  }

  convertLunarToSolar(
    year: number,
    month: number,
    day: number,
    isLeapMonth = false
  ) {
    return this.lunarService.lunarToSolar(year, month, day, isLeapMonth);
  }

  convertSolarToLunar(year: number, month: number, day: number) {
    return this.lunarService.solarToLunar(year, month, day);
  }

  isHoliday(date: Date) {
    const year = date.getFullYear();
    const holidays = this.holidayService.getHolidays(year);
    const isHoliday = holidays.some(
      (h) => h.date.toDateString() === date.toDateString()
    );
    return { date, isHoliday };
  }

  get24SolarTerms(year: number) {
    return this.lunarService.get24SolarTerms(year);
  }
}
