// weather/weather.service.ts
import { Injectable } from "@nestjs/common";
import { KmaApiService } from "./kma-api.service";
import { CityService, City } from "./city.service";

@Injectable()
export class WeatherService {
  constructor(
    private readonly kmaApi: KmaApiService,
    private readonly cityService: CityService
  ) {}

  async getCurrentWeather(cityName: string) {
    const city = this.cityService.getCityByName(cityName);
    if (!city) {
      return {
        error: "City not found",
        availableCities: this.cityService.getAllCities(),
      };
    }

    const weather = await this.kmaApi.getCurrentWeather(city.nx, city.ny);

    return {
      city: city.name,
      nameKo: city.nameKo,
      region: city.region,
      ...weather,
      updatedAt: new Date().toISOString(),
    };
  }

  async getForecast(cityName: string, days: number = 7) {
    const city = this.cityService.getCityByName(cityName);
    if (!city) {
      return { error: "City not found" };
    }

    const forecast = await this.kmaApi.getForecast(city.nx, city.ny, days);

    return {
      city: city.name,
      nameKo: city.nameKo,
      forecast,
      updatedAt: new Date().toISOString(),
    };
  }

  async getHourlyForecast(cityName: string) {
    const city = this.cityService.getCityByName(cityName);
    if (!city) {
      return { error: "City not found" };
    }

    const hourly = await this.kmaApi.getHourlyForecast(city.nx, city.ny);

    return {
      city: city.name,
      nameKo: city.nameKo,
      hourly,
      updatedAt: new Date().toISOString(),
    };
  }

  async getAirQuality(cityName: string) {
    const city = this.cityService.getCityByName(cityName);
    if (!city) {
      return { error: "City not found" };
    }

    const airQuality = await this.kmaApi.getAirQuality(city.nameKo);

    return {
      city: city.name,
      nameKo: city.nameKo,
      airQuality,
      updatedAt: new Date().toISOString(),
    };
  }

  async getWeatherAlerts(cityName: string) {
    const city = this.cityService.getCityByName(cityName);
    if (!city) {
      return { error: "City not found" };
    }

    const alerts = await this.kmaApi.getWeatherAlerts(city.region);

    return {
      city: city.name,
      nameKo: city.nameKo,
      region: city.region,
      alerts,
      updatedAt: new Date().toISOString(),
    };
  }

  getCities(region?: string): City[] {
    if (region) {
      return this.cityService.getCitiesByRegion(region);
    }
    return this.cityService.getAllCities();
  }

  async getUVIndex(cityName: string) {
    const city = this.cityService.getCityByName(cityName);
    if (!city) {
      return { error: "City not found" };
    }

    const uvIndex = await this.kmaApi.getUVIndex(city.nx, city.ny);

    return {
      city: city.name,
      nameKo: city.nameKo,
      uvIndex,
      updatedAt: new Date().toISOString(),
    };
  }
}
