import { Controller, Get, Query, Param, Header } from "@nestjs/common";
import { WeatherService } from "./weather.service";
import { City } from "./city.service";

@Controller("api/weather")
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get("current/:city")
  @Header("Cache-Control", "public, max-age=300") // 5 minutes
  async getCurrentWeather(@Param("city") city: string) {
    return this.weatherService.getCurrentWeather(city);
  }

  @Get("forecast/:city")
  @Header("Cache-Control", "public, max-age=300") // 5 minutes
  async getForecast(@Param("city") city: string, @Query("days") days?: string) {
    const numDays = days ? parseInt(days, 10) : 7; // Default to 7 days
    const maxDays = Math.min(Math.max(numDays, 1), 7); // Ensure between 1-7 days
    return this.weatherService.getForecast(city, maxDays);
  }

  @Get("hourly/:city")
  @Header("Cache-Control", "public, max-age=300") // 5 minutes
  async getHourlyForecast(@Param("city") city: string) {
    return this.weatherService.getHourlyForecast(city);
  }

  @Get("air-quality/:city")
  @Header("Cache-Control", "public, max-age=300") // 5 minutes
  async getAirQuality(@Param("city") city: string) {
    return this.weatherService.getAirQuality(city);
  }

  @Get("alerts/:city")
  @Header("Cache-Control", "public, max-age=300") // 5 minutes
  async getWeatherAlerts(@Param("city") city: string) {
    return this.weatherService.getWeatherAlerts(city);
  }

  @Get("cities")
  @Header("Cache-Control", "public, max-age=3600") // 1 hour (static data)
  async getCities(@Query("region") region?: string): Promise<City[]> {
    return this.weatherService.getCities(region);
  }

  @Get("uv-index/:city")
  @Header("Cache-Control", "public, max-age=300") // 5 minutes
  async getUVIndex(@Param("city") city: string) {
    return this.weatherService.getUVIndex(city);
  }
}
