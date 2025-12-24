import { Controller, Get, Query, Param } from "@nestjs/common";
import { WeatherService } from "./weather.service";
import { City } from "./city.service";

@Controller("api/weather")
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get("current/:city")
  async getCurrentWeather(@Param("city") city: string) {
    return this.weatherService.getCurrentWeather(city);
  }

  @Get("forecast/:city")
  async getForecast(@Param("city") city: string, @Query("days") days?: string) {
    const numDays = days ? parseInt(days, 10) : 7; // Default to 7 days
    const maxDays = Math.min(Math.max(numDays, 1), 7); // Ensure between 1-7 days
    console.log(`Forecast requested for ${city}: ${maxDays} days`);
    return this.weatherService.getForecast(city, maxDays);
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
