import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { WeatherController } from "./weather.controller";
import { WeatherService } from "./weather.service";
import { KmaApiService } from "./kma-api.service";
import { CityService } from "./city.service";

@Module({
  imports: [HttpModule],
  controllers: [WeatherController],
  providers: [WeatherService, KmaApiService, CityService],
  exports: [WeatherService],
})
export class WeatherModule {}
