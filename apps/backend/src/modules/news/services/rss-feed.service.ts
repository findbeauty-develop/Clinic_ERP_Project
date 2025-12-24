import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { PressRelease } from "../interface/news.interface";

export interface RssFeedSource {
  name: string;
  url: string;
  source: string;
}

@Injectable()
export class RssFeedService {
  private readonly logger = new Logger(RssFeedService.name);
  private readonly parser: Parser;
  private readonly defaultImageUrl =
    "https://via.placeholder.com/400x300/4F46E5/FFFFFF?text=No+Image";

  // Korean media RSS feed sources
  private readonly rssSources: RssFeedSource[] = [
    {
      name: "Yonhap",
      url: "https://www.yna.co.kr/rss/all.xml",
      source: "연합뉴스",
    },
    {
      name: "Hankyoreh",
      url: "https://www.hani.co.kr/rss/",
      source: "한겨레",
    },
    {
      name: "JoongAng",
      url: "https://rss.joins.com/joins_news_list.xml",
      source: "중앙일보",
    },
    {
      name: "Chosun",
      url: "https://www.chosun.com/arc/outboundfeeds/rss/",
      source: "조선일보",
    },
  ];

  constructor(private readonly httpService: HttpService) {
    this.parser = new Parser({
      timeout: 10000, // 10 second timeout
      customFields: {
        item: [
          ["media:content", "mediaContent", { keepArray: true }],
          ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
        ],
      },
    });
  }

  /**
   * Fetch and parse RSS feed from a single source
   */
  async fetchRssFeed(source: RssFeedSource): Promise<PressRelease[]> {
    try {
      this.logger.log(`Fetching RSS feed from ${source.name}: ${source.url}`);

      const feed = await this.parser.parseURL(source.url);

      if (!feed || !feed.items || feed.items.length === 0) {
        this.logger.warn(`No items found in RSS feed: ${source.name}`);
        return [];
      }

      this.logger.log(
        `Found ${feed.items.length} items in RSS feed: ${source.name}`
      );

      const pressReleases: PressRelease[] = feed.items
        .map((item, index) => {
          try {
            return this.parseRssItem(item, source.source, index);
          } catch (error) {
            this.logger.error(
              `Error parsing RSS item ${index} from ${source.name}:`,
              error
            );
            return null;
          }
        })
        .filter((item): item is PressRelease => item !== null);

      this.logger.log(
        `Successfully parsed ${pressReleases.length} items from ${source.name}`
      );

      return pressReleases;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to fetch RSS feed from ${source.name}: ${errorMessage}`
      );
      return []; // Return empty array on error, don't break the whole process
    }
  }

  /**
   * Fetch RSS feeds from all sources
   */
  async fetchAllRssFeeds(limitPerSource: number = 10): Promise<PressRelease[]> {
    this.logger.log(`Fetching RSS feeds from ${this.rssSources.length} sources`);

    const allFeeds = await Promise.allSettled(
      this.rssSources.map((source) => this.fetchRssFeed(source))
    );

    const allItems: PressRelease[] = [];

    allFeeds.forEach((result, index) => {
      if (result.status === "fulfilled") {
        // Limit items per source
        const limitedItems = result.value.slice(0, limitPerSource);
        allItems.push(...limitedItems);
        this.logger.log(
          `Added ${limitedItems.length} items from ${this.rssSources[index].name}`
        );
      } else {
        this.logger.error(
          `Failed to fetch from ${this.rssSources[index].name}:`,
          result.reason
        );
      }
    });

    // Sort by publish date (newest first)
    allItems.sort((a, b) => {
      const dateA = new Date(a.publishDate).getTime();
      const dateB = new Date(b.publishDate).getTime();
      return dateB - dateA;
    });

    this.logger.log(`Total RSS items fetched: ${allItems.length}`);

    return allItems;
  }

  /**
   * Parse a single RSS item into PressRelease format
   */
  private parseRssItem(
    item: Parser.Item,
    source: string,
    index: number
  ): PressRelease {
    // Extract title
    const title = item.title || "";

    // Extract link (detailUrl)
    const detailUrl = item.link || "";

    // Extract publish date
    const publishDate = item.pubDate
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString();

    // Extract description and clean HTML
    let description = item.contentSnippet || item.content || "";
    if (item.content && !item.contentSnippet) {
      // Clean HTML from content
      const $ = cheerio.load(item.content);
      description = $("body").text().trim() || $.root().text().trim();
    }

    // Extract image URL
    const imageUrl = this.extractImageUrl(item, detailUrl);

    // Extract author/manager from creator field
    const manager = item.creator || "";

    // Extract contact (usually not available in RSS)
    const contact = "";

    return {
      title,
      detailUrl,
      department: source,
      manager,
      contact,
      publishDate,
      content: description,
      imageUrl: imageUrl || undefined,
      thumbnailUrl: imageUrl || undefined,
    };
  }

  /**
   * Extract image URL from RSS item
   * Priority: 1) enclosure, 2) media:content, 3) description img tag, 4) media:thumbnail
   */
  private extractImageUrl(item: Parser.Item, detailUrl: string): string | null {
    // Priority 1: Check enclosure (most reliable) - rss-parser uses singular 'enclosure'
    if (item.enclosure) {
      const enclosure = item.enclosure;
      if (
        enclosure.type &&
        enclosure.type.startsWith("image/") &&
        enclosure.url
      ) {
        this.logger.debug(`Found image from enclosure: ${enclosure.url}`);
        return enclosure.url;
      }
    }

    // Priority 2: Check media:content (for media RSS)
    if ((item as any).mediaContent) {
      const mediaContent = (item as any).mediaContent;
      const content = Array.isArray(mediaContent) ? mediaContent[0] : mediaContent;
      if (content?.$?.url && content?.$?.type?.startsWith("image/")) {
        this.logger.debug(`Found image from media:content: ${content.$.url}`);
        return content.$.url;
      }
    }

    // Priority 3: Extract from description HTML
    if (item.content || item.contentSnippet) {
      const htmlContent = item.content || "";
      if (htmlContent) {
        const $ = cheerio.load(htmlContent);
        const imgSrc = $("img").first().attr("src");
        if (imgSrc) {
          // Convert relative URL to absolute
          const absoluteUrl = imgSrc.startsWith("http")
            ? imgSrc
            : new URL(imgSrc, detailUrl || "https://example.com").href;
          this.logger.debug(`Found image from description: ${absoluteUrl}`);
          return absoluteUrl;
        }
      }
    }

    // Priority 4: Check media:thumbnail
    if ((item as any).mediaThumbnail) {
      const thumbnail = (item as any).mediaThumbnail;
      const thumb = Array.isArray(thumbnail) ? thumbnail[0] : thumbnail;
      if (thumb?.$?.url) {
        this.logger.debug(`Found image from media:thumbnail: ${thumb.$.url}`);
        return thumb.$.url;
      }
    }

    // No image found
    return null;
  }

  /**
   * Get list of available RSS sources
   */
  getRssSources(): RssFeedSource[] {
    return this.rssSources;
  }
}

