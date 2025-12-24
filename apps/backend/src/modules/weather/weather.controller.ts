import { Controller, Get, Query, Param } from "@nestjs/common";
import { WeatherService } from "./weather.service";
import { City } from "./city.service";

@Controller("api/weather")
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get("current/:city")
  async getCurrentWeather(@Param("city") city: string): Promise<any> {
    return this.weatherService.getCurrentWeather(city);
  }

  @Get("forecast/:city")
  async getForecast(@Param("city") city: string, @Query("days") days?: string) {
    const numDays = days ? parseInt(days) : 3;
    return this.weatherService.getForecast(city, numDays);
  }

  @Get("hourly/:city")
  async getHourlyForecast(@Param("city") city: string) {
    return this.weatherService.getHourlyForecast(city);
  }

  @Get("air-quality/:city")
  async getAirQuality(@Param("city") city: string) {
    return this.weatherService.getAirQuality(city);
  }

  @Get("alerts/:city")
  async getWeatherAlerts(@Param("city") city: string) {
    return this.weatherService.getWeatherAlerts(city);
  }

  @Get("cities")
  async getCities(@Query("region") region?: string): Promise<City[]> {
    return this.weatherService.getCities(region);
  }

  @Get("uv-index/:city")
  async getUVIndex(@Param("city") city: string) {
    return this.weatherService.getUVIndex(city);
  }
}
