import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { NewsService } from "../services/news.service";
import { SearchNewsDto } from "../dto/search-news.dto";

@Controller("news")
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get("top-headlines")
  async getTopHeadlines(
    @Query("category") category?: string,
    @Query("pageSize") pageSize?: number,
    @Query("page") page?: number,
    @Query("withImage") withImage?: string
  ) {
    try {
      const hasImage = withImage === "true";
      return await this.newsService.getTopHeadlines(
        category,
        pageSize,
        page,
        hasImage
      );
    } catch (error) {
      throw new HttpException(
        (error instanceof Error
          ? error.message
          : "Failed to fetch top headlines") || "Failed to fetch top headlines",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get("search")
  async searchNews(@Query() searchDto: SearchNewsDto) {
    try {
      return await this.newsService.searchNews(searchDto);
    } catch (error) {
      throw new HttpException(
        (error instanceof Error ? error.message : "Failed to search news") ||
          "Failed to search news",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get("category")
  async getNewsByCategory(
    @Query("category") category: string,
    @Query("pageSize") pageSize?: number,
    @Query("page") page?: number,
    @Query("withImage") withImage?: string
  ) {
    if (!category) {
      throw new HttpException(
        "Category parameter is required",
        HttpStatus.BAD_REQUEST
      );
    }

    const validCategories = [
      "business",
      "entertainment",
      "general",
      "health",
      "science",
      "sports",
      "technology",
    ];
    if (!validCategories.includes(category)) {
      throw new HttpException(
        `Invalid category. Must be one of: ${validCategories.join(", ")}`,
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      const hasImage = withImage === "true";
      return await this.newsService.getNewsByCategory(
        category,
        pageSize,
        page,
        hasImage
      );
    } catch (error) {
      throw new HttpException(
        (error instanceof Error
          ? error.message
          : "Failed to fetch news by category") ||
          "Failed to fetch news by category",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get("with-images")
  async getNewsWithImages(
    @Query("category") category?: string,
    @Query("pageSize") pageSize?: number
  ) {
    try {
      return await this.newsService.getNewsWithImages(category, pageSize);
    } catch (error) {
      throw new HttpException(
        (error instanceof Error
          ? error.message
          : "Failed to fetch news with images") ||
          "Failed to fetch news with images",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get("sources")
  async getNewsSources() {
    try {
      return await this.newsService.getNewsSources();
    } catch (error) {
      throw new HttpException(
        (error instanceof Error
          ? error.message
          : "Failed to fetch news sources") || "Failed to fetch news sources",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get("categories")
  getAvailableCategories() {
    return {
      categories: [
        { key: "business", name: "비즈니스", description: "Business news" },
        {
          key: "entertainment",
          name: "엔터테인먼트",
          description: "Entertainment news",
        },
        { key: "general", name: "일반", description: "General news" },
        { key: "health", name: "건강", description: "Health news" },
        { key: "science", name: "과학", description: "Science news" },
        { key: "sports", name: "스포츠", description: "Sports news" },
        { key: "technology", name: "기술", description: "Technology news" },
      ],
    };
  }
}
