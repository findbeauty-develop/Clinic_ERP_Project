import { Injectable, Logger } from "@nestjs/common";
import { DataGoKrService } from "./data-go-kr.service";
import { RssFeedService } from "./rss-feed.service";
import { SearchNewsDto } from "../dto/search-news.dto";
import { PressReleaseResponse } from "../interface/news.interface";

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly dataGoKrService: DataGoKrService,
    private readonly rssFeedService: RssFeedService
  ) {}

  async getPressReleases(
    searchDto: SearchNewsDto
  ): Promise<PressReleaseResponse> {
    const { pageNo, numOfRows, searchKeyword } = searchDto;
    return this.dataGoKrService.getPressReleases(
      pageNo,
      numOfRows,
      searchKeyword
    );
  }

  async getLatestNews(
    numOfRows: number = 40,
    category?: string
  ): Promise<PressReleaseResponse> {
    try {
      // Fetch only from RSS feeds with category filtering
      const rssItems = await this.rssFeedService.fetchAllRssFeeds(
        numOfRows,
        category
      );

      // Sort by publish date (newest first) - already sorted in fetchAllRssFeeds
      // Limit to requested number
      const limitedItems = rssItems.slice(0, numOfRows);

      this.logger.log(
        `Returning ${limitedItems.length} RSS news items${
          category ? ` for category: ${category}` : ""
        }`
      );

      return {
        resultCode: "00",
        resultMsg: "NORMAL_CODE",
        totalCount: limitedItems.length,
        items: limitedItems,
        pageNo: 1,
        numOfRows: limitedItems.length,
      };
    } catch (error) {
      this.logger.error("Error in getLatestNews:", error);
      // Return empty response instead of falling back to government API
      return {
        resultCode: "01",
        resultMsg: "Failed to fetch RSS feeds",
        totalCount: 0,
        items: [],
        pageNo: 1,
        numOfRows: 0,
      };
    }
  }

  async searchNews(
    keyword: string,
    numOfRows: number = 20
  ): Promise<PressReleaseResponse> {
    return this.dataGoKrService.getPressReleases(1, numOfRows, keyword);
  }

  /**
   * Get news only from RSS feeds with optional category filtering
   */
  async getRssNews(numOfRows: number = 20, category?: string): Promise<any[]> {
    return this.rssFeedService.fetchAllRssFeeds(numOfRows, category);
  }

  /**
   * Get list of RSS sources
   */
  getRssSources() {
    return this.rssFeedService.getRssSources();
  }
}
