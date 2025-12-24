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

  // Korean media RSS feed sources (only working feeds - removed broken ones)
  private readonly rssSources: RssFeedSource[] = [
    {
      name: "Hankyoreh",
      url: "https://www.hani.co.kr/rss/",
      source: "한겨레",
    },
    {
      name: "SBS",
      url: "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01&plink=RSSREADER",
      source: "SBS",
    },
    {
      name: "GoogleNewsKR",
      url: "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko",
      source: "구글뉴스",
    },
    // Removed broken feeds (404/406 errors):
    // - Yonhap: https://www.yna.co.kr/rss/all.xml (404)
    // - JoongAng: https://rss.joins.com/joins_news_list.xml (406)
    // - Chosun: https://www.chosun.com/arc/outboundfeeds/rss/ (404)
    // - KBS: https://news.kbs.co.kr/rss/news.xml (404)
    // - JTBC: https://news.jtbc.co.kr/rss/news.xml (404)
    // {
    //   name: "GoogleNewsKR_Tech",
    //   url: "https://news.google.com/rss/search?q=기술&hl=ko&gl=KR&ceid=KR:ko",
    //   source: "구글뉴스(기술)",
    // },
    // {
    //   name: "GoogleNewsKR_Economy",
    //   url: "https://news.google.com/rss/search?q=경제&hl=ko&gl=KR&ceid=KR:ko",
    //   source: "구글뉴스(경제)",
    // },
    {
      name: "NewsNaver",
      url: "https://news.google.com/rss/search?q=site:news.naver.com&hl=ko&gl=KR&ceid=KR:ko",
      source: "네이버뉴스(구글RSS)",
    },
    {
      name: "NewsDaum",
      url: "https://news.google.com/rss/search?q=site:v.daum.net&hl=ko&gl=KR&ceid=KR:ko",
      source: "다음뉴스(구글RSS)",
    },
    {
      name: "MK",
      url: "https://news.google.com/rss/search?q=site:mk.co.kr&hl=ko&gl=KR&ceid=KR:ko",
      source: "매일경제(구글RSS)",
    },
    {
      name: "Hankyung",
      url: "https://news.google.com/rss/search?q=site:hankyung.com&hl=ko&gl=KR&ceid=KR:ko",
      source: "한국경제(구글RSS)",
    },
  ];

  constructor(private readonly httpService: HttpService) {
    this.parser = new Parser({
      timeout: 10000, // 10 second timeout
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      customFields: {
        item: [
          ["media:content", "mediaContent", { keepArray: true }],
          ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
          ["enclosure", "enclosures", { keepArray: true }], // Support multiple enclosures
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
        .filter((item): item is PressRelease => {
          // Filter out null items and items without images
          if (!item) return false;
          // Only include items that have a valid image URL (not placeholder)
          return !!(
            item.imageUrl &&
            item.imageUrl !== this.defaultImageUrl &&
            item.imageUrl.trim() !== ""
          );
        });

      // Log image extraction statistics
      const itemsWithImages = pressReleases.filter(
        (item) => item.imageUrl && item.imageUrl !== this.defaultImageUrl
      ).length;

      this.logger.log(
        `Successfully parsed ${pressReleases.length} items from ${source.name} (${itemsWithImages} with images)`
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
   * Category to keywords mapping for filtering RSS items
   */
  private readonly categoryKeywords: Record<string, string[]> = {
    추천: [], // No filtering for "추천" - show all
    건강: [
      "건강",
      "의료",
      "병원",
      "질병",
      "치료",
      "의사",
      "환자",
      "보건",
      "의약",
      "약품",
      "헬스",
      "웰빙",
      "운동",
      "다이어트",
      "영양",
    ],
    비즈니스: [
      "경제",
      "비즈니스",
      "기업",
      "경영",
      "시장",
      "주식",
      "금융",
      "은행",
      "투자",
      "경영",
      "CEO",
      "사업",
      "산업",
      "무역",
      "수출",
      "수입",
    ],
    기술: [
      "기술",
      "IT",
      "인공지능",
      "AI",
      "빅데이터",
      "클라우드",
      "소프트웨어",
      "하드웨어",
      "스마트폰",
      "컴퓨터",
      "인터넷",
      "디지털",
      "전자",
      "반도체",
      "로봇",
      "자동화",
    ],
    과학: [
      "과학",
      "연구",
      "발견",
      "실험",
      "우주",
      "우주선",
      "항공",
      "물리",
      "화학",
      "생물",
      "의학",
      "바이오",
      "유전자",
      "DNA",
      "항생제",
      "백신",
    ],
    스포츠: [
      "스포츠",
      "야구",
      "축구",
      "농구",
      "배구",
      "골프",
      "테니스",
      "올림픽",
      "월드컵",
      "선수",
      "경기",
      "리그",
      "우승",
      "득점",
      "골",
      "홈런",
    ],
    엔터테인먼트: [
      "엔터테인먼트",
      "연예",
      "영화",
      "드라마",
      "배우",
      "가수",
      "아이돌",
      "K-pop",
      "음악",
      "콘서트",
      "공연",
      "예능",
      "방송",
      "TV",
      "OTT",
      "넷플릭스",
    ],
  };

  /**
   * Filter items by category keywords (softened - more lenient matching)
   */
  private filterByCategory(
    items: PressRelease[],
    category: string
  ): PressRelease[] {
    if (category === "추천" || !category) {
      return items; // Show all for "추천"
    }

    const keywords = this.categoryKeywords[category] || [];
    if (keywords.length === 0) {
      return items; // No keywords means show all
    }

    // Enhanced filtering with better scoring:
    // 1. Title matches get higher score than content matches
    // 2. Multiple keyword matches increase score
    // 3. Items with images get bonus points
    // 4. Score-based ranking with better distribution
    const scoredItems = items.map((item) => {
      const titleText = (item.title || "").toLowerCase();
      const contentText = (item.content || "").toLowerCase();
      const departmentText = (item.department || "").toLowerCase();
      const searchText = `${titleText} ${contentText} ${departmentText}`;

      // Calculate match score
      let score = 0;
      let titleMatches = 0;
      let contentMatches = 0;

      keywords.forEach((keyword) => {
        const lowerKeyword = keyword.toLowerCase();

        // Title match gets highest score (3 points)
        if (titleText.includes(lowerKeyword)) {
          score += 3;
          titleMatches++;
        }
        // Content match gets medium score (1 point)
        else if (contentText.includes(lowerKeyword)) {
          score += 1;
          contentMatches++;
        }
        // Department match gets medium score (1 point)
        else if (departmentText.includes(lowerKeyword)) {
          score += 1;
        }
        // Partial word match in title (2 points)
        else if (
          lowerKeyword.length > 2 &&
          titleText.includes(
            lowerKeyword.substring(0, Math.min(3, lowerKeyword.length))
          )
        ) {
          score += 2;
          titleMatches++;
        }
        // Partial word match in content (0.5 points)
        else if (
          lowerKeyword.length > 2 &&
          contentText.includes(
            lowerKeyword.substring(0, Math.min(3, lowerKeyword.length))
          )
        ) {
          score += 0.5;
          contentMatches++;
        }
      });

      // Bonus: Multiple keyword matches in title (multiplier effect)
      if (titleMatches >= 2) {
        score *= 1.5;
      }

      // Bonus: Item has image (prefer items with images)
      if (item.imageUrl && item.imageUrl !== this.defaultImageUrl) {
        score += 2;
      }

      // Bonus: Recent items (published within last 24 hours)
      try {
        const publishDate = new Date(item.publishDate);
        const now = new Date();
        const hoursDiff =
          (now.getTime() - publishDate.getTime()) / (1000 * 60 * 60);
        if (hoursDiff < 24) {
          score += 1; // Recent news bonus
        }
      } catch (e) {
        // Ignore date parsing errors
      }

      return { item, score };
    });

    // Sort by score (highest first), then by publish date (newest first)
    scoredItems.sort((a, b) => {
      if (Math.abs(a.score - b.score) > 0.1) {
        return b.score - a.score; // Sort by score first
      }
      // If scores are close, sort by date
      try {
        const dateA = new Date(a.item.publishDate).getTime();
        const dateB = new Date(b.item.publishDate).getTime();
        return dateB - dateA;
      } catch (e) {
        return 0;
      }
    });

    // Improved filtering logic
    const matchedItems = scoredItems.filter(({ score }) => score > 0);
    const allScored = scoredItems; // Keep all items for fallback

    if (matchedItems.length >= 10) {
      // If we have many matches, return top 80% (more items)
      const topCount = Math.max(10, Math.floor(matchedItems.length * 0.8));
      return matchedItems.slice(0, topCount).map(({ item }) => item);
    } else if (matchedItems.length >= 5) {
      // If we have moderate matches, return all matched items
      return matchedItems.map(({ item }) => item);
    } else if (matchedItems.length > 0) {
      // If we have few matches, return all matches + top scored items from all
      const matched = matchedItems.map(({ item }) => item);
      const remaining = allScored
        .filter(
          ({ item }) => !matched.some((m) => m.detailUrl === item.detailUrl)
        )
        .slice(0, Math.max(5, 10 - matched.length))
        .map(({ item }) => item);
      return [...matched, ...remaining];
    } else {
      // No matches at all - return top scored items (at least 10)
      return allScored
        .slice(0, Math.max(10, Math.min(20, allScored.length)))
        .map(({ item }) => item);
    }
  }

  /**
   * Fetch RSS feeds from all sources with category filtering
   */
  async fetchAllRssFeeds(
    limitPerSource: number = 10,
    category?: string
  ): Promise<PressRelease[]> {
    this.logger.log(
      `Fetching RSS feeds from ${this.rssSources.length} sources${
        category ? ` (category: ${category})` : ""
      }`
    );

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

    // Filter out items without images first
    const itemsWithImages = allItems.filter(
      (item) =>
        item.imageUrl &&
        item.imageUrl !== this.defaultImageUrl &&
        item.imageUrl.trim() !== ""
    );

    this.logger.log(
      `Filtered ${allItems.length} items to ${itemsWithImages.length} items with images`
    );

    // Filter by category if provided (filterByCategory already sorts by score and date)
    let filteredItems = itemsWithImages;
    if (category) {
      filteredItems = this.filterByCategory(itemsWithImages, category);
      this.logger.log(
        `Filtered ${itemsWithImages.length} items to ${filteredItems.length} items for category: ${category}`
      );
    } else {
      // If no category, sort by date (newest first)
      filteredItems.sort((a, b) => {
        try {
          const dateA = new Date(a.publishDate).getTime();
          const dateB = new Date(b.publishDate).getTime();
          return dateB - dateA;
        } catch (e) {
          return 0;
        }
      });
    }

    this.logger.log(
      `Total RSS items fetched: ${filteredItems.length} (all with images)`
    );

    return filteredItems;
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

    // Extract image URL (enhanced - try multiple methods)
    let imageUrl = this.extractImageUrl(item, detailUrl);

    // If no image found, try to extract from description more aggressively
    if (!imageUrl && (item.content || item.contentSnippet)) {
      imageUrl = this.extractImageFromDescription(
        item.content || item.contentSnippet || "",
        detailUrl
      );
    }

    // If still no image found, item will be filtered out later

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
   * Extract image URL from RSS item (enhanced for full-size images)
   * Priority: 1) enclosure (full-size), 2) media:content (largest), 3) description img (largest), 4) media:thumbnail
   */
  private extractImageUrl(item: Parser.Item, detailUrl: string): string | null {
    const foundImages: Array<{ url: string; priority: number; size?: number }> =
      [];

    // Priority 1: Check enclosure (most reliable, usually full-size) - rss-parser uses singular 'enclosure'
    if (item.enclosure) {
      const enclosure = item.enclosure;
      if (
        enclosure.type &&
        enclosure.type.startsWith("image/") &&
        enclosure.url
      ) {
        const url = enclosure.url;
        foundImages.push({
          url,
          priority: 1,
          size: this.estimateImageSize(url),
        });
      } else if (enclosure.url && this.isImageUrl(enclosure.url)) {
        const url = enclosure.url;
        foundImages.push({
          url,
          priority: 1,
          size: this.estimateImageSize(url),
        });
      }
    }

    // Priority 1b: Check multiple enclosures (if available) - prefer larger ones
    if ((item as any).enclosures && Array.isArray((item as any).enclosures)) {
      ((item as any).enclosures as any[]).forEach((enc: any) => {
        if (
          (enc.type && enc.type.startsWith("image/")) ||
          (enc.url && this.isImageUrl(enc.url))
        ) {
          const url = enc.url;
          foundImages.push({
            url,
            priority: 1,
            size: this.estimateImageSize(url),
          });
        }
      });
    }

    // Priority 2: Check media:content (for media RSS) - prefer larger images
    if ((item as any).mediaContent) {
      const mediaContent = (item as any).mediaContent;
      const contents = Array.isArray(mediaContent)
        ? mediaContent
        : [mediaContent];
      contents.forEach((content: any) => {
        if (content?.$?.url && content?.$?.type?.startsWith("image/")) {
          const url = content.$.url;
          // Check for width/height attributes to prefer larger images
          const width = content?.$?.width ? parseInt(content.$.width) : 0;
          const height = content?.$?.height ? parseInt(content.$.height) : 0;
          foundImages.push({
            url,
            priority: 2,
            size: width * height || this.estimateImageSize(url),
          });
        }
      });
    }

    // Priority 3: Extract from description HTML (enhanced - prefer larger images)
    if (item.content || item.contentSnippet) {
      const htmlContent = item.content || "";
      if (htmlContent) {
        const $ = cheerio.load(htmlContent);
        // Try multiple img selectors and get all images
        const images: Array<{ src: string; width?: number; height?: number }> =
          [];

        $("img").each((_, el) => {
          const src =
            $(el).attr("src") ||
            $(el).attr("data-src") ||
            $(el).attr("data-lazy-src") ||
            $(el).attr("data-original") ||
            $(el).attr("data-url") ||
            $(el).attr("href");
          if (src) {
            const width = parseInt($(el).attr("width") || "0");
            const height = parseInt($(el).attr("height") || "0");
            images.push({ src, width, height });
          }
        });

        // Also check figure and image containers (more selectors for business news)
        $(
          "figure img, .image img, .photo img, .thumbnail img, .news-image img, .article-image img, .content-image img"
        ).each((_, el) => {
          const src =
            $(el).attr("src") ||
            $(el).attr("data-src") ||
            $(el).attr("data-lazy-src") ||
            $(el).attr("data-original");
          if (src && !images.some((img) => img.src === src)) {
            const width = parseInt($(el).attr("width") || "0");
            const height = parseInt($(el).attr("height") || "0");
            images.push({ src, width, height });
          }
        });

        // Also check for background-image in style attributes
        $("[style*='background-image']").each((_, el) => {
          const style = $(el).attr("style") || "";
          const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
          if (match && match[1]) {
            const src = match[1];
            if (!images.some((img) => img.src === src)) {
              images.push({ src, width: 0, height: 0 });
            }
          }
        });

        // Process and validate images
        images.forEach((img) => {
          let imgSrc = img.src;
          // Clean up the URL (but keep size parameters for some CDNs)
          if (!imgSrc.includes("width=") && !imgSrc.includes("w=")) {
            imgSrc = imgSrc.split("?")[0].split("&")[0];
          }

          // Convert relative URL to absolute
          const absoluteUrl = imgSrc.startsWith("http")
            ? imgSrc
            : new URL(imgSrc, detailUrl || "https://example.com").href;

          // Validate it's actually an image URL
          if (this.isImageUrl(absoluteUrl)) {
            const size =
              (img.width || 0) * (img.height || 0) ||
              this.estimateImageSize(absoluteUrl);
            foundImages.push({
              url: absoluteUrl,
              priority: 3,
              size,
            });
          }
        });
      }
    }

    // Priority 4: Check media:thumbnail (last resort, usually smaller)
    if ((item as any).mediaThumbnail) {
      const thumbnail = (item as any).mediaThumbnail;
      const thumbs = Array.isArray(thumbnail) ? thumbnail : [thumbnail];
      thumbs.forEach((thumb: any) => {
        if (thumb?.$?.url) {
          const url = thumb.$.url;
          // Try to get larger version if available
          const largerUrl = this.getLargerImageUrl(url);
          foundImages.push({
            url: largerUrl || url,
            priority: 4,
            size: this.estimateImageSize(largerUrl || url),
          });
        }
      });
    }

    // If we found images, return the best one (highest priority, largest size)
    if (foundImages.length > 0) {
      // Sort by priority first, then by size (descending)
      foundImages.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority; // Lower priority number = better
        }
        return (b.size || 0) - (a.size || 0); // Larger size = better
      });

      const bestImage = foundImages[0];
      return bestImage.url;
    }

    // No image found
    return null;
  }

  /**
   * Extract image from description text/HTML (fallback method)
   */
  private extractImageFromDescription(
    description: string,
    detailUrl: string
  ): string | null {
    if (!description) return null;

    try {
      const $ = cheerio.load(description);

      // Try to find images in various ways
      const imgSrc =
        $("img").first().attr("src") ||
        $("img").first().attr("data-src") ||
        $("img").first().attr("data-lazy-src") ||
        $("img").first().attr("data-original") ||
        $("a[href*='.jpg'], a[href*='.png'], a[href*='.jpeg']")
          .first()
          .attr("href");

      if (imgSrc) {
        const absoluteUrl = imgSrc.startsWith("http")
          ? imgSrc
          : new URL(imgSrc, detailUrl || "https://example.com").href;

        if (this.isImageUrl(absoluteUrl)) {
          return absoluteUrl;
        }
      }
    } catch (e) {
      // Ignore parsing errors
    }

    return null;
  }

  /**
   * Check if URL is likely an image URL (enhanced for business news)
   */
  private isImageUrl(url: string): boolean {
    if (!url) return false;

    // Remove common tracking parameters
    const cleanUrl = url.split("?")[0].split("#")[0];
    const lowerUrl = cleanUrl.toLowerCase();

    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".bmp",
      ".svg",
    ];

    // Check for image extensions
    if (imageExtensions.some((ext) => lowerUrl.includes(ext))) {
      return true;
    }

    // Check for image-related paths (more patterns for business news sites)
    const imagePathPatterns = [
      "/image/",
      "/img/",
      "/photo/",
      "/picture/",
      "/photo/",
      "/images/",
      "/imgs/",
      "/photos/",
      "/pictures/",
      "/media/",
      "/upload/",
      "/files/",
      "/assets/",
      "/static/",
      "/cdn/",
    ];

    if (imagePathPatterns.some((pattern) => lowerUrl.includes(pattern))) {
      // Additional check: make sure it's not a CSS or JS file
      if (
        !lowerUrl.includes(".css") &&
        !lowerUrl.includes(".js") &&
        !lowerUrl.includes(".html")
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Estimate image size from URL (for sorting - prefer larger images)
   */
  private estimateImageSize(url: string): number {
    if (!url) return 0;
    const lowerUrl = url.toLowerCase();

    // Check for size indicators in URL
    const sizeMatch = lowerUrl.match(/(\d{3,4})[x_](\d{3,4})/);
    if (sizeMatch) {
      return parseInt(sizeMatch[1]) * parseInt(sizeMatch[2]);
    }

    // Check for common size keywords
    if (
      lowerUrl.includes("large") ||
      lowerUrl.includes("full") ||
      lowerUrl.includes("original")
    ) {
      return 1000000; // High priority for large images
    }
    if (lowerUrl.includes("medium") || lowerUrl.includes("mid")) {
      return 500000;
    }
    if (
      lowerUrl.includes("small") ||
      lowerUrl.includes("thumb") ||
      lowerUrl.includes("thumbnail")
    ) {
      return 100000; // Lower priority for thumbnails
    }

    // Default medium size
    return 300000;
  }

  /**
   * Try to get larger version of image URL (replace thumbnail with full-size)
   */
  private getLargerImageUrl(url: string): string | null {
    if (!url) return null;

    // Common patterns to replace thumbnail with full-size
    const replacements = [
      { from: /thumb/g, to: "large" },
      { from: /thumbnail/g, to: "original" },
      { from: /small/g, to: "large" },
      { from: /_s\./g, to: "_l." },
      { from: /_m\./g, to: "_l." },
      { from: /_t\./g, to: "_l." },
      { from: /w\d+h\d+/g, to: "w1200h800" }, // Replace size params
      { from: /width=\d+/g, to: "width=1200" },
      { from: /height=\d+/g, to: "height=800" },
    ];

    let largerUrl = url;
    for (const { from, to } of replacements) {
      largerUrl = largerUrl.replace(from, to);
    }

    // Only return if URL actually changed
    return largerUrl !== url ? largerUrl : null;
  }

  /**
   * Get list of available RSS sources
   */
  getRssSources(): RssFeedSource[] {
    return this.rssSources;
  }
}
