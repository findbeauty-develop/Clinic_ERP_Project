// import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
// import { HttpService } from "@nestjs/axios";
// import { ConfigService } from "@nestjs/config";
// import { firstValueFrom } from "rxjs";
// import { NewsApiResponse } from "../interface/news.interface";

// @Injectable()
// export class NewsApiService {
//   private readonly apiKey: string;
//   private readonly baseUrl = "https://newsapi.org/v2";

//   constructor(
//     private readonly httpService: HttpService,
//     private readonly configService: ConfigService
//   ) {
//     const apiKey = this.configService.get<string>("NEWSAPI_KEY");
//     if (!apiKey) {
//       throw new Error("NEWSAPI_KEY is not configured in environment variables");
//     }
//     this.apiKey = apiKey;
//   }

//   async getTopHeadlines(
//     category?: string,
//     pageSize: number = 20,
//     page: number = 1
//   ): Promise<NewsApiResponse> {
//     try {
//       // Ensure pageSize is valid (NewsAPI top-headlines doesn't support 'page' parameter)
//       const validPageSize =
//         isNaN(pageSize) || pageSize < 1
//           ? 20
//           : Math.min(Math.floor(pageSize), 100);

//       const params: any = {
//         apiKey: this.apiKey,
//         pageSize: validPageSize,
//         // Note: NewsAPI top-headlines endpoint doesn't support 'page' parameter
//         // Only 'everything' endpoint supports pagination
//       };

//       // NewsAPI top-headlines: category and country CANNOT be used together!
//       // We'll use only country, then filter by category in backend service layer
//       // Always use Korea for Korean news
//       params.country = "kr";

//       // Note: Don't use category parameter here - NewsAPI doesn't support category+country together
//       // Category filtering will be done in news.service.ts after receiving articles

//       console.log("NewsAPI Request params:", params);
//       console.log("NewsAPI Request URL:", `${this.baseUrl}/top-headlines`);

//       const response = await firstValueFrom(
//         this.httpService.get(`${this.baseUrl}/top-headlines`, { params })
//       );

//       console.log(
//         "NewsAPI Full Response:",
//         JSON.stringify(response.data, null, 2)
//       );
//       console.log("NewsAPI Response status:", response.data?.status);
//       console.log("NewsAPI Total results:", response.data?.totalResults);
//       console.log("NewsAPI Articles count:", response.data?.articles?.length);

//       if (response.data?.status === "error") {
//         console.error("NewsAPI Error:", response.data);
//         throw new Error(response.data.message || "NewsAPI returned an error");
//       }

//       return response.data;
//     } catch (error: unknown) {
//       const httpError = error as {
//         response?: { data?: { message?: string }; status?: number };
//       };
//       throw new HttpException(
//         httpError.response?.data?.message || "Failed to fetch top headlines",
//         httpError.response?.status || HttpStatus.BAD_REQUEST
//       );
//     }
//   }

//   async searchNews(
//     query: string,
//     pageSize: number = 20,
//     page: number = 1,
//     sortBy: string = "publishedAt"
//   ): Promise<NewsApiResponse> {
//     try {
//       const params = {
//         q: query,
//         language: "ko",
//         apiKey: this.apiKey,
//         pageSize,
//         page,
//         sortBy,
//       };

//       const response = await firstValueFrom(
//         this.httpService.get(`${this.baseUrl}/everything`, { params })
//       );

//       return response.data;
//     } catch (error: unknown) {
//       const httpError = error as {
//         response?: { data?: { message?: string }; status?: number };
//       };
//       throw new HttpException(
//         httpError.response?.data?.message || "Failed to search news",
//         httpError.response?.status || HttpStatus.BAD_REQUEST
//       );
//     }
//   }

//   async getNewsSources(): Promise<any> {
//     try {
//       const params = {
//         country: "kr",
//         apiKey: this.apiKey,
//       };

//       const response = await firstValueFrom(
//         this.httpService.get(`${this.baseUrl}/top-headlines/sources`, {
//           params,
//         })
//       );

//       return response.data;
//     } catch (error: unknown) {
//       const httpError = error as {
//         response?: { data?: { message?: string }; status?: number };
//       };
//       throw new HttpException(
//         httpError.response?.data?.message || "Failed to fetch news sources",
//         httpError.response?.status || HttpStatus.BAD_REQUEST
//       );
//     }
//   }
// }
