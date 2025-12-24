import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

@Injectable()
export class KmaApiService {
  private readonly apiKey: string;
  private readonly baseUrl =
    "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";

  constructor(private readonly httpService: HttpService) {
    // In production, use ConfigService to get API key from .env
    this.apiKey = process.env.KMA_API_KEY || "YOUR_API_KEY";
  }

  async getCurrentWeather(nx: number, ny: number) {
    // Mock data for demonstration
    // In production, call actual KMA API
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

  async getForecast(nx: number, ny: number, days: number) {
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

  async getHourlyForecast(nx: number, ny: number) {
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
