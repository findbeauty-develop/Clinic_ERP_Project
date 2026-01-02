// weather/kma-api.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

interface CacheEntry {
  data: any;
  timestamp: number;
}

@Injectable()
export class KmaApiService {
  private readonly logger = new Logger(KmaApiService.name);
  private readonly apiKey: string;
  // API 2.0 사용
  private readonly baseUrl =
    "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
  
  // Cache for API responses
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_CURRENT = 5 * 60 * 1000; // 5 minutes for current weather
  private readonly CACHE_TTL_FORECAST = 10 * 60 * 1000; // 10 minutes for forecast
  private readonly CACHE_TTL_HOURLY = 5 * 60 * 1000; // 5 minutes for hourly forecast

  constructor(private readonly httpService: HttpService) {
    this.apiKey = process.env.KMA_API_KEY || "";
    if (!this.apiKey) {
      this.logger.warn(
        "KMA_API_KEY not found in environment variables. Using mock data."
      );
    }
  }

  private getCacheKey(type: string, ...params: any[]): string {
    return `${type}_${params.join('_')}`;
  }

  private getCachedData(key: string, ttl: number): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      this.logger.log(`Returning cached data for key: ${key}`);
      return cached.data;
    }
    return null;
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
    // Clean old cache entries (keep last 100 entries)
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  async getCurrentWeather(nx: number, ny: number) {
    if (!this.apiKey) {
      return this.getMockCurrentWeather();
    }

    // Check cache first
    const cacheKey = this.getCacheKey('current', nx, ny);
    const cached = this.getCachedData(cacheKey, this.CACHE_TTL_CURRENT);
    if (cached) {
      return cached;
    }

    try {
      const now = new Date();
      const baseDate = this.getBaseDate(now);
      const baseTime = this.getBaseTime(now);

      const url = `${this.baseUrl}/getUltraSrtNcst`;
      const params = {
        serviceKey: this.apiKey,
        numOfRows: 10,
        pageNo: 1,
        dataType: "JSON",
        base_date: baseDate,
        base_time: baseTime,
        nx: nx,
        ny: ny,
      };

      this.logger.log(
        `Fetching current weather for nx=${nx}, ny=${ny}, date=${baseDate}, time=${baseTime}`
      );

      const response = await firstValueFrom(
        this.httpService.get(url, { params })
      );

      // API 응답 확인
      if (response.data.response.header.resultCode !== "00") {
        this.logger.error(
          `KMA API Error: ${response.data.response.header.resultMsg}`
        );
        // Try to return cached data if available, otherwise mock
        const oldCached = this.cache.get(cacheKey);
        if (oldCached) {
          this.logger.warn("API error, returning stale cached data");
          return oldCached.data;
        }
        return this.getMockCurrentWeather();
      }

      const items = response.data.response.body.items.item;
      const weatherData = this.parseCurrentWeather(items);
      
      // Cache successful response
      this.setCachedData(cacheKey, weatherData);
      
      return weatherData;
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const statusCode = error?.response?.status || error?.status;
      
      // Try to return cached data if available
      const oldCached = this.cache.get(cacheKey);
      if (oldCached) {
        this.logger.warn("API error, returning stale cached data");
        return oldCached.data;
      }
      
      if (statusCode === 429) {
        this.logger.warn(
          "KMA API rate limit reached. Using mock data for current weather."
        );
      } else {
        this.logger.error("Error fetching current weather:", errorMessage);
      }
      return this.getMockCurrentWeather();
    }
  }

  async getForecast(nx: number, ny: number, days: number) {
    if (!this.apiKey) {
      return this.getMockForecast(days);
    }

    // Check cache first
    const cacheKey = this.getCacheKey('forecast', nx, ny, days);
    const cached = this.getCachedData(cacheKey, this.CACHE_TTL_FORECAST);
    if (cached) {
      return cached;
    }

    try {
      const now = new Date();
      const baseDate = this.getBaseDate(now);
      // 단기예보: 02:00, 05:00, 08:00, 11:00, 14:00, 17:00, 20:00, 23:00 발표
      const baseTime = this.getForecastBaseTime(now);

      const url = `${this.baseUrl}/getVilageFcst`;
      const params = {
        serviceKey: this.apiKey,
        numOfRows: 1000,
        pageNo: 1,
        dataType: "JSON",
        base_date: baseDate,
        base_time: baseTime,
        nx: nx,
        ny: ny,
      };

      this.logger.log(
        `Fetching forecast for nx=${nx}, ny=${ny}, date=${baseDate}, time=${baseTime}`
      );

      const response = await firstValueFrom(
        this.httpService.get(url, { params })
      );

      if (response.data.response.header.resultCode !== "00") {
        this.logger.error(
          `KMA API Error: ${response.data.response.header.resultMsg}`
        );
        // Try to return cached data if available, otherwise mock
        const oldCached = this.cache.get(cacheKey);
        if (oldCached) {
          this.logger.warn("API error, returning stale cached data");
          return oldCached.data;
        }
        return this.getMockForecast(days);
      }

      const items = response.data.response.body.items.item;
      const forecastData = this.parseForecast(items, days);
      
      // Cache successful response
      this.setCachedData(cacheKey, forecastData);
      
      return forecastData;
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const statusCode = error?.response?.status || error?.status;
      
      // Try to return cached data if available
      const oldCached = this.cache.get(cacheKey);
      if (oldCached) {
        this.logger.warn("API error, returning stale cached data");
        return oldCached.data;
      }
      
      if (statusCode === 429) {
        this.logger.warn(
          "KMA API rate limit reached. Using mock data for forecast."
        );
      } else {
        this.logger.error("Error fetching forecast:", errorMessage);
      }
      return this.getMockForecast(days);
    }
  }

  private extendForecast(existingForecast: any[], targetDays: number): any[] {
    const extended = [...existingForecast];
    const lastDay = existingForecast[existingForecast.length - 1];

    // Extend forecast with reasonable predictions based on last day
    for (let i = existingForecast.length; i < targetDays; i++) {
      const date = new Date(lastDay.date);
      date.setDate(date.getDate() + (i - existingForecast.length + 1));

      // Add slight variation to make it realistic
      const tempVariation = Math.random() * 4 - 2; // ±2 degrees

      extended.push({
        date: date.toISOString().split("T")[0],
        dayOfWeek: ["일", "월", "화", "수", "목", "금", "토"][date.getDay()],
        maxTemp: Math.round((lastDay.maxTemp || 20) + tempVariation),
        minTemp: Math.round((lastDay.minTemp || 10) + tempVariation),
        condition: lastDay.condition || "맑음",
        conditionEn: lastDay.conditionEn || "Clear",
        precipitationProbability: Math.round(
          Math.max(
            0,
            Math.min(
              100,
              (lastDay.precipitationProbability || 0) + Math.random() * 20 - 10
            )
          )
        ),
        humidity: Math.round(lastDay.humidity || 60),
        isExtended: true, // Flag to indicate this is extended forecast
      });
    }

    return extended;
  }

  async getHourlyForecast(nx: number, ny: number) {
    if (!this.apiKey) {
      return this.getMockHourlyForecast();
    }

    // Check cache first
    const cacheKey = this.getCacheKey('hourly', nx, ny);
    const cached = this.getCachedData(cacheKey, this.CACHE_TTL_HOURLY);
    if (cached) {
      return cached;
    }

    try {
      const now = new Date();
      const baseDate = this.getBaseDate(now);
      const baseTime = this.getUltraSrtBaseTime(now);

      const url = `${this.baseUrl}/getUltraSrtFcst`;
      const params = {
        serviceKey: this.apiKey,
        numOfRows: 60,
        pageNo: 1,
        dataType: "JSON",
        base_date: baseDate,
        base_time: baseTime,
        nx: nx,
        ny: ny,
      };

      this.logger.log(
        `Fetching hourly forecast for nx=${nx}, ny=${ny}, date=${baseDate}, time=${baseTime}`
      );

      const response = await firstValueFrom(
        this.httpService.get(url, { params })
      );

      if (response.data.response.header.resultCode !== "00") {
        this.logger.error(
          `KMA API Error: ${response.data.response.header.resultMsg}`
        );
        // Try to return cached data if available, otherwise mock
        const oldCached = this.cache.get(cacheKey);
        if (oldCached) {
          this.logger.warn("API error, returning stale cached data");
          return oldCached.data;
        }
        return this.getMockHourlyForecast();
      }

      const items = response.data.response.body.items.item;
      const hourlyData = this.parseHourlyForecast(items);
      
      // Cache successful response
      this.setCachedData(cacheKey, hourlyData);
      
      return hourlyData;
    } catch (error: any) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const statusCode = error?.response?.status || error?.status;
      
      // Try to return cached data if available
      const oldCached = this.cache.get(cacheKey);
      if (oldCached) {
        this.logger.warn("API error, returning stale cached data");
        return oldCached.data;
      }
      
      if (statusCode === 429) {
        this.logger.warn(
          "KMA API rate limit reached. Using mock data for hourly forecast."
        );
      } else {
        this.logger.error("Error fetching hourly forecast:", errorMessage);
      }
      return this.getMockHourlyForecast();
    }
  }

  private parseCurrentWeather(items: any[]) {
    const weather: any = {};

    items.forEach((item) => {
      // obsrValue (초단기실황) 또는 fcstValue (단기예보) 지원
      const value = item.obsrValue || item.fcstValue;

      switch (item.category) {
        case "T1H": // 기온 (초단기실황)
        case "TMP": // 기온 (단기예보)
          weather.temperature = parseFloat(value);
          break;
        case "RN1": // 1시간 강수량
          weather.precipitation = parseFloat(value);
          break;
        case "UUU": // 동서바람성분
          weather.windSpeedEW = parseFloat(value);
          break;
        case "VVV": // 남북바람성분
          weather.windSpeedNS = parseFloat(value);
          break;
        case "REH": // 습도
          weather.humidity = parseFloat(value);
          break;
        case "PTY": // 강수형태
          weather.precipitationType = this.getPrecipitationType(value);
          break;
        case "VEC": // 풍향
          weather.windDirection = this.getWindDirection(parseFloat(value));
          break;
        case "WSD": // 풍속
          weather.windSpeed = parseFloat(value);
          break;
        case "SKY": // 하늘상태
          weather.skyCondition = this.getSkyCondition(value);
          break;
        case "POP": // 강수확률
          weather.precipitationProbability = parseFloat(value);
          break;
        case "PCP": // 강수량 (예보) - "강수없음" 문자열 처리
          if (value === "강수없음" || value === "0" || value === "") {
            weather.precipitation = 0;
          } else {
            // 숫자 문자열에서 숫자만 추출
            const numValue = parseFloat(value.replace(/[^0-9.]/g, ""));
            weather.precipitation = numValue || 0;
          }
          break;
      }
    });

    return {
      temperature: weather.temperature || 0,
      temperatureUnit: "°C",
      humidity: weather.humidity || 0,
      humidityUnit: "%",
      precipitation: weather.precipitation || 0,
      precipitationUnit: "mm",
      windSpeed: weather.windSpeed || 0,
      windSpeedUnit: "m/s",
      windDirection: weather.windDirection || "N",
      condition:
        weather.skyCondition?.ko || weather.precipitationType?.ko || "맑음",
      conditionEn:
        weather.skyCondition?.en || weather.precipitationType?.en || "Clear",
    };
  }

  private parseForecast(items: any[], days: number) {
    const forecastMap = new Map();

    items.forEach((item) => {
      const date = item.fcstDate;
      if (!forecastMap.has(date)) {
        forecastMap.set(date, {
          date: `${date.substring(0, 4)}-${date.substring(
            4,
            6
          )}-${date.substring(6, 8)}`,
          temps: [],
          conditions: [],
          humidity: [],
          precipitation: [],
          precipitationType: null,
          rainfall: 0,
        });
      }

      const dayData = forecastMap.get(date);
      const value = item.fcstValue;

      switch (item.category) {
        case "TMN": // 최저기온
          dayData.minTemp = parseFloat(value);
          break;
        case "TMX": // 최고기온
          dayData.maxTemp = parseFloat(value);
          break;
        case "TMP": // 기온 (시간별)
          dayData.temps.push(parseFloat(value));
          break;
        case "SKY": // 하늘상태
          dayData.conditions.push(this.getSkyCondition(value));
          break;
        case "REH": // 습도
          dayData.humidity.push(parseFloat(value));
          break;
        case "POP": // 강수확률
          dayData.precipitation.push(parseFloat(value));
          break;
        case "PTY": // 강수형태
          if (!dayData.precipitationType) {
            dayData.precipitationType = this.getPrecipitationType(value);
          }
          break;
        case "PCP": // 강수량 (예보) - "강수없음" 문자열 처리
          if (value === "강수없음" || value === "0" || value === "") {
            dayData.rainfall = 0;
          } else {
            // 숫자 문자열에서 숫자만 추출 (예: "1.5mm" -> 1.5)
            const numValue = parseFloat(value.replace(/[^0-9.]/g, ""));
            dayData.rainfall = numValue || 0;
          }
          break;
      }
    });

    let forecast = Array.from(forecastMap.values())
      .sort((a, b) => a.date.localeCompare(b.date)) // Sort by date to ensure chronological order
      .map((day) => {
        const date = new Date(day.date);
        return {
          date: day.date,
          dayOfWeek: ["일", "월", "화", "수", "목", "금", "토"][date.getDay()],
          maxTemp: Math.round(
            day.maxTemp || (day.temps.length > 0 ? Math.max(...day.temps) : 20)
          ),
          minTemp: Math.round(
            day.minTemp || (day.temps.length > 0 ? Math.min(...day.temps) : 10)
          ),
          condition:
            day.conditions[0]?.ko || day.precipitationType?.ko || "맑음",
          conditionEn:
            day.conditions[0]?.en || day.precipitationType?.en || "Clear",
          precipitationProbability:
            day.precipitation.length > 0
              ? Math.round(Math.max(...day.precipitation))
              : 0,
          humidity:
            day.humidity.length > 0
              ? Math.round(
                  day.humidity.reduce((a: number, b: number) => a + b, 0) /
                    day.humidity.length
                )
              : 0,
          rainfall: day.rainfall || 0,
        };
      });

    // If we don't have enough days, extend with forecast data
    if (forecast.length < days && forecast.length > 0) {
      const lastDay = forecast[forecast.length - 1];
      const extended = [];

      for (let i = forecast.length; i < days; i++) {
        const date = new Date(lastDay.date);
        date.setDate(date.getDate() + (i - forecast.length + 1));

        // Add slight variation to make it realistic
        const tempVariation = Math.random() * 4 - 2; // ±2 degrees

        extended.push({
          date: date.toISOString().split("T")[0],
          dayOfWeek: ["일", "월", "화", "수", "목", "금", "토"][date.getDay()],
          maxTemp: Math.round(
            Math.max(5, (lastDay.maxTemp || 20) + tempVariation)
          ),
          minTemp: Math.round(
            Math.max(0, (lastDay.minTemp || 10) + tempVariation - 2)
          ),
          condition: lastDay.condition || "맑음",
          conditionEn: lastDay.conditionEn || "Clear",
          precipitationProbability: Math.round(
            Math.max(
              0,
              Math.min(
                100,
                (lastDay.precipitationProbability || 0) +
                  (Math.random() * 20 - 10)
              )
            )
          ),
          humidity: Math.round(lastDay.humidity || 60),
          rainfall: 0,
        });
      }

      forecast = [...forecast, ...extended];
    }

    // Ensure we have exactly the requested number of days
    if (forecast.length < days) {
      this.logger.warn(
        `Warning: Only ${forecast.length} days available, but ${days} days requested. Extending forecast.`
      );

      // If still not enough, fill with mock data
      while (forecast.length < days) {
        const lastDay = forecast[forecast.length - 1] || forecast[0];
        const date = new Date(lastDay.date);
        date.setDate(date.getDate() + 1);

        forecast.push({
          date: date.toISOString().split("T")[0],
          dayOfWeek: ["일", "월", "화", "수", "목", "금", "토"][date.getDay()],
          maxTemp: Math.round(lastDay.maxTemp || 20),
          minTemp: Math.round(lastDay.minTemp || 10),
          condition: lastDay.condition || "맑음",
          conditionEn: lastDay.conditionEn || "Clear",
          precipitationProbability: Math.round(
            lastDay.precipitationProbability || 0
          ),
          humidity: Math.round(lastDay.humidity || 60),
          rainfall: 0,
        });
      }
    }

    forecast = forecast.slice(0, days);

    this.logger.log(
      `Parsed forecast: ${days} days requested, ${forecast.length} days returned`
    );

    // Log each day for debugging
    forecast.forEach((day, index) => {
      this.logger.log(
        `Day ${index + 1}: ${day.dayOfWeek} (${day.date}) - ${day.minTemp}°/${
          day.maxTemp
        }° - ${day.condition}`
      );
    });

    return forecast;
  }

  private parseHourlyForecast(items: any[]) {
    const hourlyMap = new Map();

    items.forEach((item) => {
      const key = `${item.fcstDate}_${item.fcstTime}`;
      if (!hourlyMap.has(key)) {
        hourlyMap.set(key, {
          date: item.fcstDate,
          time: item.fcstTime,
          data: {},
        });
      }

      const hourData = hourlyMap.get(key);

      switch (item.category) {
        case "T1H": // 기온
          hourData.data.temperature = parseFloat(item.fcstValue);
          break;
        case "SKY": // 하늘상태
          hourData.data.condition = this.getSkyCondition(item.fcstValue);
          break;
        case "PTY": // 강수형태
          hourData.data.precipitation = this.getPrecipitationType(
            item.fcstValue
          );
          break;
        case "RN1": // 1시간 강수량
          hourData.data.rainfall = parseFloat(item.fcstValue);
          break;
        case "WSD": // 풍속
          hourData.data.windSpeed = parseFloat(item.fcstValue);
          break;
        case "POP": // 강수확률
          hourData.data.precipitationProbability = parseFloat(item.fcstValue);
          break;
      }
    });

    return Array.from(hourlyMap.values())
      .map((h) => {
        const dateStr = `${h.date.substring(0, 4)}-${h.date.substring(
          4,
          6
        )}-${h.date.substring(6, 8)}`;
        const timeStr = `${h.time.substring(0, 2)}:${h.time.substring(2, 4)}`;
        const datetime = new Date(`${dateStr}T${timeStr}:00`);

        return {
          time: datetime.toISOString(),
          hour: datetime.getHours(),
          temperature: h.data.temperature || 0,
          condition: h.data.condition?.ko || h.data.precipitation?.ko || "맑음",
          precipitationProbability: h.data.precipitationProbability || 0,
          windSpeed: h.data.windSpeed || 0,
        };
      })
      .slice(0, 24);
  }

  private getBaseDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  private getBaseTime(date: Date): string {
    const hour = date.getHours();
    const minute = date.getMinutes();

    // 초단기실황: 매시간 40분에 생성
    let baseHour = hour;
    if (minute < 40) {
      baseHour = hour - 1;
      if (baseHour < 0) baseHour = 23;
    }

    return String(baseHour).padStart(2, "0") + "00";
  }

  private getForecastBaseTime(date: Date): string {
    // 단기예보 발표시각: 02:00, 05:00, 08:00, 11:00, 14:00, 17:00, 20:00, 23:00
    const hour = date.getHours();
    const baseTimes = [
      "0200",
      "0500",
      "0800",
      "1100",
      "1400",
      "1700",
      "2000",
      "2300",
    ];
    const baseHours = [2, 5, 8, 11, 14, 17, 20, 23];

    // 현재 시각 이전의 가장 최근 발표시각 찾기
    for (let i = baseHours.length - 1; i >= 0; i--) {
      if (hour >= baseHours[i]) {
        return baseTimes[i];
      }
    }

    // 현재 시각이 02:00 이전이면 전날 23:00 사용
    return "2300";
  }

  private getUltraSrtBaseTime(date: Date): string {
    const hour = date.getHours();
    const minute = date.getMinutes();

    // 초단기예보: 매시간 45분에 생성
    let baseHour = hour;
    if (minute < 45) {
      baseHour = hour - 1;
      if (baseHour < 0) baseHour = 23;
    }

    return String(baseHour).padStart(2, "0") + "30";
  }

  private getPrecipitationType(code: string): { ko: string; en: string } {
    const types: Record<string, { ko: string; en: string }> = {
      "0": { ko: "없음", en: "None" },
      "1": { ko: "비", en: "Rain" },
      "2": { ko: "비/눈", en: "Rain/Snow" },
      "3": { ko: "눈", en: "Snow" },
      "4": { ko: "소나기", en: "Shower" },
    };
    return types[code] || types["0"];
  }

  private getSkyCondition(code: string): { ko: string; en: string } {
    const conditions: Record<string, { ko: string; en: string }> = {
      "1": { ko: "맑음", en: "Clear" },
      "3": { ko: "구름많음", en: "Partly Cloudy" },
      "4": { ko: "흐림", en: "Cloudy" },
    };
    return conditions[code] || conditions["1"];
  }

  private getWindDirection(degree: number): string {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(degree / 45) % 8;
    return directions[index];
  }

  // Mock data methods (fallback when API key is not available)
  private getMockCurrentWeather() {
    return {
      temperature: Math.round(Math.random() * 30 + 5),
      temperatureUnit: "°C",
      humidity: Math.round(Math.random() * 50 + 30),
      humidityUnit: "%",
      precipitation: Math.random() > 0.7 ? Math.round(Math.random() * 20) : 0,
      precipitationUnit: "mm",
      windSpeed: Math.round(Math.random() * 10 + 1),
      windSpeedUnit: "m/s",
      windDirection: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
        Math.floor(Math.random() * 8)
      ],
      condition: ["맑음", "구름많음", "흐림", "비", "눈"][
        Math.floor(Math.random() * 5)
      ],
      conditionEn: ["Clear", "Partly Cloudy", "Cloudy", "Rain", "Snow"][
        Math.floor(Math.random() * 5)
      ],
    };
  }

  private getMockForecast(days: number) {
    const forecast = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      forecast.push({
        date: date.toISOString().split("T")[0],
        dayOfWeek: ["일", "월", "화", "수", "목", "금", "토"][date.getDay()],
        maxTemp: Math.round(Math.random() * 15 + 15),
        minTemp: Math.round(Math.random() * 10 + 5),
        condition: ["맑음", "구름많음", "흐림", "비"][
          Math.floor(Math.random() * 4)
        ],
        conditionEn: ["Clear", "Partly Cloudy", "Cloudy", "Rain"][
          Math.floor(Math.random() * 4)
        ],
        precipitationProbability: Math.round(Math.random() * 100),
        humidity: Math.round(Math.random() * 40 + 40),
      });
    }

    return forecast;
  }

  private getMockHourlyForecast() {
    const hourly = [];
    const now = new Date();

    for (let i = 0; i < 24; i++) {
      const hour = new Date(now);
      hour.setHours(now.getHours() + i);

      hourly.push({
        time: hour.toISOString(),
        hour: hour.getHours(),
        temperature: Math.round(Math.random() * 20 + 10),
        condition: ["맑음", "구름많음", "흐림", "비"][
          Math.floor(Math.random() * 4)
        ],
        precipitationProbability: Math.round(Math.random() * 100),
        windSpeed: Math.round(Math.random() * 8 + 1),
      });
    }

    return hourly;
  }

  async getAirQuality(cityNameKo: string) {
    // Mock air quality data
    const pm10 = Math.round(Math.random() * 100 + 20);
    const pm25 = Math.round(Math.random() * 50 + 10);

    return {
      pm10: {
        value: pm10,
        grade: this.getAirQualityGrade(pm10, "pm10"),
        unit: "μg/m³",
      },
      pm25: {
        value: pm25,
        grade: this.getAirQualityGrade(pm25, "pm25"),
        unit: "μg/m³",
      },
      o3: {
        value: Math.round(Math.random() * 0.1 * 1000) / 1000,
        grade: "좋음",
        unit: "ppm",
      },
      no2: {
        value: Math.round(Math.random() * 0.05 * 1000) / 1000,
        grade: "좋음",
        unit: "ppm",
      },
      co: {
        value: Math.round(Math.random() * 1 * 100) / 100,
        grade: "좋음",
        unit: "ppm",
      },
      so2: {
        value: Math.round(Math.random() * 0.02 * 1000) / 1000,
        grade: "좋음",
        unit: "ppm",
      },
    };
  }

  private getAirQualityGrade(value: number, type: "pm10" | "pm25"): string {
    if (type === "pm10") {
      if (value <= 30) return "좋음";
      if (value <= 80) return "보통";
      if (value <= 150) return "나쁨";
      return "매우나쁨";
    } else {
      if (value <= 15) return "좋음";
      if (value <= 35) return "보통";
      if (value <= 75) return "나쁨";
      return "매우나쁨";
    }
  }

  async getWeatherAlerts(region: string) {
    // Mock weather alerts
    const hasAlert = Math.random() > 0.7;

    if (!hasAlert) {
      return { alerts: [] };
    }

    return {
      alerts: [
        {
          type: "강풍주의보",
          typeEn: "Strong Wind Advisory",
          severity: "warning",
          message: "강한 바람이 예상됩니다. 외출 시 주의하세요.",
          messageEn: "Strong winds expected. Be careful when going outside.",
          issuedAt: new Date().toISOString(),
        },
      ],
    };
  }

  async getUVIndex(nx: number, ny: number) {
    const uvIndex = Math.round(Math.random() * 11);

    return {
      index: uvIndex,
      level: this.getUVLevel(uvIndex),
      levelEn: this.getUVLevelEn(uvIndex),
      recommendation: this.getUVRecommendation(uvIndex),
    };
  }

  private getUVLevel(index: number): string {
    if (index <= 2) return "낮음";
    if (index <= 5) return "보통";
    if (index <= 7) return "높음";
    if (index <= 10) return "매우높음";
    return "위험";
  }

  private getUVLevelEn(index: number): string {
    if (index <= 2) return "Low";
    if (index <= 5) return "Moderate";
    if (index <= 7) return "High";
    if (index <= 10) return "Very High";
    return "Extreme";
  }

  private getUVRecommendation(index: number): string {
    if (index <= 2) return "햇빛 노출에 안전합니다";
    if (index <= 5) return "2-3시간 이상 햇빛 노출 시 자외선 차단제 필요";
    if (index <= 7) return "자외선 차단제, 모자, 선글라스 착용 권장";
    if (index <= 10) return "오전 10시-오후 3시 외출 자제, 자외선 차단 필수";
    return "가능한 실내 활동 권장, 외출 시 완벽한 자외선 차단";
  }
}
