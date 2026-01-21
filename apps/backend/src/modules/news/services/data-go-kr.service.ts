import { Injectable, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

import { parseStringPromise } from "xml2js";
import * as cheerio from "cheerio";
import {
  Attachment,
  PressRelease,
  PressReleaseResponse,
} from "../interface/news.interface";

@Injectable()
export class DataGoKrService {
  private readonly logger = new Logger(DataGoKrService.name);
  private readonly serviceKey: string;
  private readonly baseUrl =
    "http://apis.data.go.kr/1721000/msitpressreleaseinfo/pressReleaseList";

  // 🆕 Default placeholder image URL
  private readonly defaultImageUrl =
    "https://via.placeholder.com/400x300/4F46E5/FFFFFF?text=No+Image";

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    const serviceKey = this.configService.get<string>("DATA_GO_KR_SERVICE_KEY");
    if (!serviceKey) {
      throw new Error(
        "DATA_GO_KR_SERVICE_KEY is not configured in environment variables"
      );
    }
    this.serviceKey = serviceKey;
  }

  async getPressReleases(
    pageNo: number = 1,
    numOfRows?: number,
    searchKeyword?: string
  ): Promise<PressReleaseResponse> {
    try {
      // Ensure numOfRows is a valid number
      const validNumOfRows = numOfRows && !isNaN(numOfRows) ? numOfRows : 10;
      const validPageNo = pageNo && !isNaN(pageNo) ? pageNo : 1;

      const params: any = {
        serviceKey: decodeURIComponent(this.serviceKey),
        pageNo: validPageNo,
        numOfRows: validNumOfRows,
        type: "json",
      };

      if (searchKeyword) {
        params.searchKeyword = searchKeyword;
      }
      

      const response = await firstValueFrom(
        this.httpService.get(this.baseUrl, { params })
      );

    
      // Handle XML response if JSON fails
      if (typeof response.data === "string") {
       
        return this.parseXmlResponse(
          response.data,
          validPageNo,
          validNumOfRows
        );
      }

     
      return this.formatResponse(response.data, validPageNo, validNumOfRows);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to fetch press releases";
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async parseXmlResponse(
    xml: string,
    pageNo: number,
    numOfRows: number
  ): Promise<PressReleaseResponse> {
    try {
      const result = await parseStringPromise(xml);
      
      const response = result.response;

      if (!response || !response.header || !response.header[0]) {
        throw new Error("Invalid XML structure: missing response.header");
      }

      if (response.header[0].resultCode[0] !== "00") {
        throw new Error(response.header[0].resultMsg?.[0] || "Unknown error");
      }

      const body = response.body?.[0];
      if (!body) {
        throw new Error("Invalid XML structure: missing response.body");
      }

      // Handle case where items might be empty or not exist
      const itemsArray = body.items?.[0];
      const items = itemsArray?.item || [];

      
      

      // If items is not an array, make it an array
      const itemsList = Array.isArray(items) ? items : items ? [items] : [];

      

      const pressReleases: PressRelease[] = itemsList.map(
        (item: any, index: number) => {
          // Extract values from XML structure (arrays)
          // Handle both array and single value formats
          const title = Array.isArray(item.subject)
            ? item.subject[0]
            : item.subject || "";

          // Extract detailUrl - check multiple possible field names
          let detailUrl = "";
          if (item.viewUrl) {
            detailUrl = Array.isArray(item.viewUrl)
              ? item.viewUrl[0]
              : item.viewUrl;
          } else if (item.detailUrl) {
            detailUrl = Array.isArray(item.detailUrl)
              ? item.detailUrl[0]
              : item.detailUrl;
          } else if (item.link) {
            detailUrl = Array.isArray(item.link) ? item.link[0] : item.link;
          }

          // Log raw viewUrl to debug
          if (index < 3) {
            this.logger.debug(`Item ${index} raw data:`, {
              viewUrl: item.viewUrl,
              detailUrl: item.detailUrl,
              link: item.link,
              extractedDetailUrl: detailUrl,
            });
          }

          const department = Array.isArray(item.deptName)
            ? item.deptName[0]
            : item.deptName || "";
          const manager = Array.isArray(item.managerName)
            ? item.managerName[0]
            : item.managerName || "";
          const contact = Array.isArray(item.managerTel)
            ? item.managerTel[0]
            : item.managerTel || "";
          const publishDate = Array.isArray(item.pressDt)
            ? item.pressDt[0]
            : item.pressDt || "";

          // Debug log to check if detailUrl is unique for each item
          

          // 🆕 Extract attachments and find image
          const attachments = this.parseAttachments(item);
          const imageAttachment = this.findImageAttachment(attachments);

          // 🆕 Try to get image: 1) from attachments, 2) from detail page, 3) use placeholder
          let imageUrl = imageAttachment?.fileUrl;

          // If no image in attachments, try to fetch from detail page (async, but we'll handle it)
          if (!imageUrl && detailUrl) {
            // We'll fetch images from detail page in background
            // For now, set a flag to fetch later or use placeholder
            imageUrl = this.defaultImageUrl; // Temporary placeholder
          }

          // If still no image, use default placeholder
          if (!imageUrl) {
            imageUrl = this.defaultImageUrl;
          }

          return {
            title,
            detailUrl,
            department,
            manager,
            contact,
            publishDate,
            attachments,
            // 🆕 Add image URL (from attachments, detail page, or placeholder)
            imageUrl: imageUrl || this.defaultImageUrl,
            thumbnailUrl: imageUrl || this.defaultImageUrl,
          };
        }
      );

      // Extract totalCount from items object (it's nested in items, not body)
      const itemsObj = body.items?.[0];
      const totalCountStr =
        itemsObj?.totalCount?.[0] || body.totalCount?.[0] || "0";

      return {
        resultCode: response.header[0].resultCode[0],
        resultMsg: response.header[0].resultMsg?.[0] || "NORMAL_CODE",
        totalCount: parseInt(totalCountStr),
        items: pressReleases,
        pageNo,
        numOfRows,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to parse XML response";
      console.error("XML parsing error:", errorMessage, error);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private formatResponse(
    data: any,
    pageNo: number,
    numOfRows: number
  ): PressReleaseResponse {
    const response = data.response;

    if (!response || response.header.resultCode !== "00") {
      throw new Error(response?.header?.resultMsg || "Invalid response");
    }

    const body = response.body;
    const items = body.items?.item || [];

    const pressReleases: PressRelease[] = Array.isArray(items)
      ? items.map((item: any) => {
          // 🆕 Extract attachments and find image
          const attachments = this.parseAttachments(item);
          const imageAttachment = this.findImageAttachment(attachments);

          return {
            title: item.bbsNttTitlNm || item.subject || "",
            detailUrl: item.detailUrl || item.viewUrl || "",
            department: item.brtcDptNm || item.deptName || "",
            manager: item.mngrNm || item.managerName || "",
            contact: item.mngrTelno || item.managerTel || "",
            publishDate: item.regYmd || item.pressDt || "",
            attachments,
            // 🆕 Add image URL from attachments (first image found)
            imageUrl:
              imageAttachment?.fileUrl ||
              item.imageUrl ||
              item.thumbUrl ||
              undefined,
            thumbnailUrl:
              item.thumbUrl || imageAttachment?.fileUrl || undefined,
          };
        })
      : [];

    return {
      resultCode: response.header.resultCode,
      resultMsg: response.header.resultMsg,
      totalCount: body.totalCount || 0,
      items: pressReleases,
      pageNo,
      numOfRows,
    };
  }

  private parseAttachments(item: any): Attachment[] {
    const attachments: Attachment[] = [];

    // Handle XML structure: files[].file[].fileName and files[].file[].fileUrl
    const files = item.files || [];

    // If files is an array
    if (Array.isArray(files)) {
      files.forEach((fileGroup: any) => {
        const fileArray = fileGroup.file || [];
        if (Array.isArray(fileArray)) {
          fileArray.forEach((file: any) => {
            const fileName = file.fileName?.[0] || file.fileName || "";
            const fileUrl = file.fileUrl?.[0] || file.fileUrl || "";

            if (fileName && fileUrl) {
              attachments.push({
                fileName:
                  typeof fileName === "string" ? fileName : String(fileName),
                fileUrl:
                  typeof fileUrl === "string" ? fileUrl : String(fileUrl),
              });
            }
          });
        } else if (fileArray && fileArray.fileName && fileArray.fileUrl) {
          // Handle single file object
          attachments.push({
            fileName: fileArray.fileName?.[0] || fileArray.fileName || "",
            fileUrl: fileArray.fileUrl?.[0] || fileArray.fileUrl || "",
          });
        }
      });
    }

    return attachments;
  }

  /**
   * 🆕 Find the first image attachment from attachments array
   * Looks for common image file extensions
   */
  private findImageAttachment(attachments: Attachment[]): Attachment | null {
    if (!attachments || attachments.length === 0) {
      return null;
    }

    // Common image file extensions
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".bmp",
      ".svg",
      ".ico",
    ];

    // Find first attachment with image extension
    for (const attachment of attachments) {
      if (attachment.fileUrl) {
        const lowerUrl = attachment.fileUrl.toLowerCase();
        const hasImageExtension = imageExtensions.some((ext) =>
          lowerUrl.includes(ext)
        );

        if (hasImageExtension) {
          return attachment;
        }
      }
    }

    return null;
  }

  /**
   * 🆕 Extract image URL from detail page HTML
   * Fetches the detail page and parses HTML to find images
   */
  private async extractImageFromDetailUrl(
    detailUrl: string
  ): Promise<string | null> {
    if (!detailUrl) {
      return null;
    }

    try {
     

      const response = await firstValueFrom(
        this.httpService.get(detailUrl, {
          timeout: 5000, // 5 second timeout
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        })
      );

      if (response.data && typeof response.data === "string") {
        const $ = cheerio.load(response.data);

        // Try to find images in common locations
        // 1. Look for img tags with src attribute
        const images: string[] = [];

        $("img").each((_: number, element: any) => {
          const src = $(element).attr("src");
          if (
            src &&
            !src.includes("data:image") &&
            !src.includes("placeholder")
          ) {
            // Convert relative URLs to absolute
            const absoluteUrl = src.startsWith("http")
              ? src
              : new URL(src, detailUrl).href;
            images.push(absoluteUrl);
          }
        });

        // 2. Look for images in content areas
        $(".content img, .article img, .post img, #content img").each(
          (_: number, element: any) => {
            const src = $(element).attr("src");
            if (
              src &&
              !src.includes("data:image") &&
              !src.includes("placeholder")
            ) {
              const absoluteUrl = src.startsWith("http")
                ? src
                : new URL(src, detailUrl).href;
              if (!images.includes(absoluteUrl)) {
                images.push(absoluteUrl);
              }
            }
          }
        );

        // Return first valid image found
        if (images.length > 0) {
          this.logger.log(`Found ${images.length} image(s) in detail page`);
          return images[0];
        }
      }

      return null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.warn(
        `Failed to extract image from detail page ${detailUrl}: ${errorMessage}`
      );
      return null;
    }
  }

  /**
   * 🆕 Batch extract images from detail pages (for multiple items)
   * This can be called asynchronously to populate images
   */
  async enrichPressReleasesWithImages(
    pressReleases: PressRelease[]
  ): Promise<PressRelease[]> {
    const enriched = await Promise.all(
      pressReleases.map(async (release) => {
        // If already has image, skip
        if (release.imageUrl && release.imageUrl !== this.defaultImageUrl) {
          return release;
        }

        // Try to fetch image from detail page
        const imageUrl = await this.extractImageFromDetailUrl(
          release.detailUrl
        );

        return {
          ...release,
          imageUrl: imageUrl || this.defaultImageUrl,
          thumbnailUrl: imageUrl || this.defaultImageUrl,
        };
      })
    );

    return enriched;
  }
}
