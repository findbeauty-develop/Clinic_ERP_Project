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

  @Get("press-releases")
  async getPressReleases(@Query() searchDto: SearchNewsDto) {
    try {
      // Ensure numOfRows is parsed correctly if it's a string
      if (searchDto.numOfRows && typeof searchDto.numOfRows === "string") {
        const parsed = parseInt(searchDto.numOfRows, 10);
        if (!isNaN(parsed)) {
          searchDto.numOfRows = parsed;
        } else {
          delete searchDto.numOfRows;
        }
      }
      return await this.newsService.getPressReleases(searchDto);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to fetch press releases";
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get("latest")
  async getLatestNews(@Query("numOfRows") numOfRows?: string) {
    try {
      const parsedNumOfRows = numOfRows ? parseInt(numOfRows, 10) : undefined;
      if (parsedNumOfRows && isNaN(parsedNumOfRows)) {
        throw new HttpException(
          "numOfRows must be a valid number",
          HttpStatus.BAD_REQUEST
        );
      }
      return await this.newsService.getLatestNews(parsedNumOfRows);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch latest news";
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get("search")
  async searchNews(
    @Query("keyword") keyword: string,
    @Query("numOfRows") numOfRows?: string
  ) {
    if (!keyword) {
      throw new HttpException(
        "Keyword parameter is required",
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      const parsedNumOfRows = numOfRows ? parseInt(numOfRows, 10) : undefined;
      if (parsedNumOfRows && isNaN(parsedNumOfRows)) {
        throw new HttpException(
          "numOfRows must be a valid number",
          HttpStatus.BAD_REQUEST
        );
      }
      return await this.newsService.searchNews(keyword, parsedNumOfRows);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to search news";
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get("rss")
  async getRssNews(@Query("numOfRows") numOfRows?: string) {
    try {
      const parsedNumOfRows = numOfRows ? parseInt(numOfRows, 10) : 20;
      if (parsedNumOfRows && isNaN(parsedNumOfRows)) {
        throw new HttpException(
          "numOfRows must be a valid number",
          HttpStatus.BAD_REQUEST
        );
      }

      const rssItems = await this.newsService.getRssNews(parsedNumOfRows);
      return {
        resultCode: "00",
        resultMsg: "NORMAL_CODE",
        totalCount: rssItems.length,
        items: rssItems,
        pageNo: 1,
        numOfRows: rssItems.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch RSS news";
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get("sources")
  getRssSources() {
    return this.newsService.getRssSources();
  }

  @Get("info")
  getApiInfo() {
    return {
      name: "Korean News API (RSS + Government)",
      sources: [
        "RSS Feeds: 연합뉴스, 한겨레, 중앙일보, 조선일보",
        "Government API: data.go.kr - 과학기술정보통신부 보도자료",
      ],
      description:
        "한국 주요 언론사 RSS 피드와 정부 공식 보도자료를 통합 제공하는 API",
      features: [
        "RSS 피드 통합 (연합뉴스, 한겨레, 중앙일보, 조선일보)",
        "정부 공식 보도자료",
        "이미지 자동 추출",
        "무료 사용",
        "실시간 업데이트",
      ],
    };
  }
}
