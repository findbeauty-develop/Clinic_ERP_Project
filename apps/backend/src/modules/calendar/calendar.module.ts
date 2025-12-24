import { Module } from "@nestjs/common";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { KoreanHolidayService } from "./korean-holiday.service";
import { LunarCalendarService } from "./lunar-calendar.service";

@Module({
  controllers: [CalendarController],
  providers: [CalendarService, KoreanHolidayService, LunarCalendarService],
})
export class CalendarModule {}
