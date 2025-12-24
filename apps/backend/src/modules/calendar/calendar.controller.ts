import { Controller, Get, Query, Param, ParseIntPipe } from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import { Holiday } from "./korean-holiday.service";

@Controller("api/calendar")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get("holidays/:year/:month")
  getMonthHolidays(
    @Param("year", ParseIntPipe) year: number,
    @Param("month", ParseIntPipe) month: number
  ): { year: number; month: number; holidays: Holiday[] } {
    return this.calendarService.getMonthlyHolidays(year, month);
  }

  @Get("holidays/:year")
  getHolidays(@Param("year", ParseIntPipe) year: number): {
    year: number;
    holidays: Holiday[];
  } {
    return this.calendarService.getYearlyHolidays(year);
  }

  @Get("lunar-to-solar")
  lunarToSolar(
    @Query("year") year: string,
    @Query("month") month: string,
    @Query("day") day: string,
    @Query("isLeapMonth") isLeapMonth?: string
  ) {
    return this.calendarService.convertLunarToSolar(
      parseInt(year),
      parseInt(month),
      parseInt(day),
      isLeapMonth === "true"
    );
  }

  @Get("solar-to-lunar")
  solarToLunar(
    @Query("year") year: string,
    @Query("month") month: string,
    @Query("day") day: string
  ) {
    return this.calendarService.convertSolarToLunar(
      parseInt(year),
      parseInt(month),
      parseInt(day)
    );
  }

  @Get("is-holiday")
  isHoliday(@Query("date") date: string) {
    return this.calendarService.isHoliday(new Date(date));
  }

  @Get("24-solar-terms/:year")
  getSolarTerms(@Param("year") year: string) {
    return this.calendarService.get24SolarTerms(parseInt(year));
  }
}
