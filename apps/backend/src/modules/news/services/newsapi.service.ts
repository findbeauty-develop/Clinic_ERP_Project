import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { NewsApiResponse } from "../interface/news.interface";

@Injectable()
export class NewsApiService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://newsapi.org/v2";

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    const apiKey = this.configService.get<string>("NEWSAPI_KEY");
    if (!apiKey) {
      throw new Error("NEWSAPI_KEY is not configured in environment variables");
    }
    this.apiKey = apiKey;
  }

  async getTopHeadlines(
    category?: string,
    pageSize: number = 20,
    page: number = 1
  ): Promise<NewsApiResponse> {
    try {
      const params: any = {
        country: "kr",
        apiKey: this.apiKey,
        pageSize,
        page,
      };

      if (category) {
        params.category = category;
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/top-headlines`, { params })
      );

      return response.data;
    } catch (error: unknown) {
      const httpError = error as {
        response?: { data?: { message?: string }; status?: number };
      };
      throw new HttpException(
        httpError.response?.data?.message || "Failed to fetch top headlines",
        httpError.response?.status || HttpStatus.BAD_REQUEST
      );
    }
  }

  async searchNews(
    query: string,
    pageSize: number = 20,
    page: number = 1,
    sortBy: string = "publishedAt"
  ): Promise<NewsApiResponse> {
    try {
      const params = {
        q: query,
        language: "ko",
        apiKey: this.apiKey,
        pageSize,
        page,
        sortBy,
      };

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/everything`, { params })
      );

      return response.data;
    } catch (error: unknown) {
      const httpError = error as {
        response?: { data?: { message?: string }; status?: number };
      };
      throw new HttpException(
        httpError.response?.data?.message || "Failed to search news",
        httpError.response?.status || HttpStatus.BAD_REQUEST
      );
    }
  }

  async getNewsSources(): Promise<any> {
    try {
      const params = {
        country: "kr",
        apiKey: this.apiKey,
      };

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/top-headlines/sources`, {
          params,
        })
      );

      return response.data;
    } catch (error: unknown) {
      const httpError = error as {
        response?: { data?: { message?: string }; status?: number };
      };
      throw new HttpException(
        httpError.response?.data?.message || "Failed to fetch news sources",
        httpError.response?.status || HttpStatus.BAD_REQUEST
      );
    }
  }
}
