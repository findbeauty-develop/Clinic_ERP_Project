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

  async getLatestNews(numOfRows: number = 20): Promise<PressReleaseResponse> {
    try {
      // Fetch only from RSS feeds (government API removed)
      const rssItems = await this.rssFeedService.fetchAllRssFeeds(numOfRows);

      // Sort by publish date (newest first)
      rssItems.sort((a, b) => {
        const dateA = new Date(a.publishDate || 0).getTime();
        const dateB = new Date(b.publishDate || 0).getTime();
        return dateB - dateA;
      });

      // Limit to requested number
      const limitedItems = rssItems.slice(0, numOfRows);

      this.logger.log(`Returning ${limitedItems.length} RSS news items`);

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
    numOfRows: number = 9
  ): Promise<PressReleaseResponse> {
    return this.dataGoKrService.getPressReleases(1, numOfRows, keyword);
  }

  /**
   * Get news only from RSS feeds
   */
  async getRssNews(numOfRows: number = 20): Promise<any[]> {
    return this.rssFeedService.fetchAllRssFeeds(numOfRows);
  }

  /**
   * Get list of RSS sources
   */
  getRssSources() {
    return this.rssFeedService.getRssSources();
  }
}
