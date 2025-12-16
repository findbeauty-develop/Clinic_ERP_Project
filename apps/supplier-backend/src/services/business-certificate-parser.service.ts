import { Injectable, Logger } from "@nestjs/common";

export interface ParsedBusinessCertificateFields {
  companyName?: string;        // 회사명
  businessNumber?: string;    // 사업자등록번호
  representativeName?: string; // 대표자명
  openingDate?: string;        // 개업연월일 (YYYYMMDD format for API)
  businessType?: string;      // 업태
  businessItem?: string;       // 종목
  address?: string;            // 주소
  rawText: string;
}

@Injectable()
export class BusinessCertificateParserService {
  private readonly logger = new Logger(BusinessCertificateParserService.name);

  /**
   * Parse Korean business registration certificate text and extract key fields
   * @param rawText Raw OCR text from certificate image
   * @returns Parsed fields object
   */
  parseBusinessCertificate(rawText: string): ParsedBusinessCertificateFields {
    // Normalize whitespace: replace multiple spaces/newlines with single space
    const normalized = rawText
      .replace(/\s+/g, " ")
      .replace(/\n+/g, " ")
      .trim();

    // Debug: Log normalized text for troubleshooting
    this.logger.debug(`Normalized OCR text (first 200 chars): ${normalized.substring(0, 200)}`);

    const fields: ParsedBusinessCertificateFields = {
      rawText: normalized,
    };

    try {
      // Helper function to clean extracted text
      const cleanText = (text: string, maxLength: number = 100): string => {
        return text.trim().substring(0, maxLength).trim();
      };

      // Extract company name (회사명) from 법인명 or 호 (Company Name)
      // Format: "호 : 한국합금" or "법인명 : ..." or "회사명 : ..."
      const companyNameMatch1 = normalized.match(
        /호\s*[:：]\s*([가-힣a-zA-Z0-9\s()]+?)(?:\s+명\s*[:：]|$)/i
      );
      if (companyNameMatch1) {
        fields.companyName = cleanText(companyNameMatch1[1], 100);
      } else {
        // Try 법인명
        const legalEntityMatch = normalized.match(
          /법인명\s*[:：]?\s*([가-힣a-zA-Z0-9\s()]+?)(?:\s+사업자등록번호|등록번호|$)/i
        );
        if (legalEntityMatch) {
          fields.companyName = cleanText(legalEntityMatch[1], 100);
        } else {
          // Fallback to 회사명
          const companyNameMatch = normalized.match(
            /회사명\s*[:：]?\s*([가-힣a-zA-Z0-9\s()]+?)(?:\s+사업자등록번호|등록번호|$)/i
          );
          if (companyNameMatch) {
            fields.companyName = cleanText(companyNameMatch[1], 100);
          }
        }
      }

      // Extract business registration number (사업자등록번호) from 등록번호
      // Try 등록번호 first, then 사업자등록번호 as fallback
      const registrationNumberMatch = normalized.match(
        /등록\s*번호\s*[:：]?\s*(\d{3}[-]?\d{2}[-]?\d{5})/i
      );
      if (registrationNumberMatch) {
        let businessNumber = registrationNumberMatch[1].replace(/\D/g, "");
        if (businessNumber.length === 10) {
          fields.businessNumber = `${businessNumber.slice(0, 3)}-${businessNumber.slice(3, 5)}-${businessNumber.slice(5)}`;
        } else {
          fields.businessNumber = registrationNumberMatch[1];
        }
      } else {
        // Fallback to 사업자등록번호
        const businessNumberMatch = normalized.match(
          /사업자등록번호\s*[:：]?\s*(\d{3}[-]?\d{2}[-]?\d{5})/i
        );
        if (businessNumberMatch) {
          let businessNumber = businessNumberMatch[1].replace(/\D/g, "");
          if (businessNumber.length === 10) {
            fields.businessNumber = `${businessNumber.slice(0, 3)}-${businessNumber.slice(3, 5)}-${businessNumber.slice(5)}`;
          } else {
            fields.businessNumber = businessNumberMatch[1];
          }
        }
      }

      // Extract representative name (대표자명)
      // Multiple formats:
      // 1. "명 : 소은숙" (Korean name)
      // 2. "대표자(대표유형) SUN WENLIN" (Foreign name - English)
      // 3. "대표자명 : ..."
      // Try multiple patterns in order of specificity
      
      // Pattern 1: "대표자(대표유형) NAME" - for foreign names (English/Chinese)
      // OCR example: "대표자(대표유형) SUN WENLIN 개업연월일"
      // Match: 대표자(대표유형) followed by name until 개업연월일
      const repNameMatch1 = normalized.match(
        /대표자\s*\([^)]*\)\s+([A-Z\s가-힣]{2,30}?)(?:\s+개업연월일|$)/i
      );
      if (repNameMatch1 && repNameMatch1[1].trim().length >= 2) {
        fields.representativeName = cleanText(repNameMatch1[1], 30);
        this.logger.debug(`Extracted representativeName (pattern 1 - foreign): ${fields.representativeName}`);
      } else {
        // Try without parentheses: "대표자 NAME 개업연월일"
        const repNameMatch1b = normalized.match(
          /대표자\s+([A-Z\s가-힣]{2,30}?)(?:\s+개업연월일|$)/i
        );
        if (repNameMatch1b && repNameMatch1b[1].trim().length >= 2) {
          fields.representativeName = cleanText(repNameMatch1b[1], 30);
          this.logger.debug(`Extracted representativeName (pattern 1b - without parentheses): ${fields.representativeName}`);
        } else {
          // Pattern 2: "명 : 소은숙" with flexible ending (Korean name)
          const repNameMatch2 = normalized.match(
            /명\s*[:：]\s*([가-힣]{2,10})(?:\s|$)/i
          );
          if (repNameMatch2) {
            fields.representativeName = cleanText(repNameMatch2[1], 30);
            this.logger.debug(`Extracted representativeName (pattern 2 - Korean): ${fields.representativeName}`);
          } else {
            // Pattern 3: "대표자 NAME" (without parentheses)
            const repNameMatch3 = normalized.match(
              /대표자\s+([A-Z\s가-힣]{2,30})(?:\s+개업연월일|$)/i
            );
            if (repNameMatch3) {
              fields.representativeName = cleanText(repNameMatch3[1], 30);
              this.logger.debug(`Extracted representativeName (pattern 3): ${fields.representativeName}`);
            } else {
              // Pattern 4: "명 : 소은숙" with specific endings
              const repNameMatch4 = normalized.match(
                /명\s*[:：]\s*([가-힣a-zA-Z\s]+?)(?:\s+상성|생년월일|개업연월일|업태|$)/i
              );
              if (repNameMatch4) {
                fields.representativeName = cleanText(repNameMatch4[1], 30);
                this.logger.debug(`Extracted representativeName (pattern 4): ${fields.representativeName}`);
              } else {
                // Pattern 5: "대표자명 : ..."
                const repNameMatch5 = normalized.match(
                  /대표자\s*명\s*[:：]?\s*([가-힣a-zA-Z\s]+?)(?:\s+업태|$)/i
                );
                if (repNameMatch5) {
                  fields.representativeName = cleanText(repNameMatch5[1], 30);
                  this.logger.debug(`Extracted representativeName (pattern 5): ${fields.representativeName}`);
                } else {
                  // Pattern 6: "명소은숙" (no space or colon)
                  const repNameMatch6 = normalized.match(
                    /명\s*([가-힣]{2,10})(?:\s|$)/i
                  );
                  if (repNameMatch6) {
                    fields.representativeName = cleanText(repNameMatch6[1], 30);
                    this.logger.debug(`Extracted representativeName (pattern 6): ${fields.representativeName}`);
                  }
                }
              }
            }
          }
        }
      }

      if (!fields.representativeName) {
        const debugText = normalized.match(/대표자[^]*?개업연월일/i)?.[0]?.substring(0, 150) || 'not found';
        this.logger.warn(`Could not extract representativeName from OCR text.`);
        this.logger.warn(`Text around '대표자': ${debugText}`);
        this.logger.warn(`Full normalized text (first 300 chars): ${normalized.substring(0, 300)}`);
        
        // Try to find what's between 대표자 and 개업연월일
        const betweenMatch = normalized.match(/대표자[^]*?개업연월일/i);
        if (betweenMatch) {
          this.logger.warn(`Text between '대표자' and '개업연월일': ${betweenMatch[0]}`);
        }
      } else {
        this.logger.log(`✅ Successfully extracted representativeName: ${fields.representativeName}`);
      }

      // Extract opening date (개업연월일) - Format: "1982 년 01 월 01 일" -> "19820101"
      // OCR example: "개업연월일 : 1982 년 01 월 01 일"
      const openingDateMatch = normalized.match(
        /개업연월일\s*[:：]\s*(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/i
      );
      if (openingDateMatch) {
        const year = openingDateMatch[1];
        const month = openingDateMatch[2].padStart(2, '0');
        const day = openingDateMatch[3].padStart(2, '0');
        fields.openingDate = `${year}${month}${day}`; // YYYYMMDD format
      } else {
        // Alternative format: "1982-01-01" or "19820101"
        const altDateMatch = normalized.match(
          /개업연월일\s*[:：]\s*(\d{4})[-]?(\d{2})[-]?(\d{2})/i
        );
        if (altDateMatch) {
          fields.openingDate = `${altDateMatch[1]}${altDateMatch[2]}${altDateMatch[3]}`;
        }
      }

      // Extract business type (업태)
      const businessTypeMatch = normalized.match(
        /업태\s*[:：]?\s*([가-힣]+?)(?:\s+종목|$)/i
      );
      if (businessTypeMatch) {
        fields.businessType = cleanText(businessTypeMatch[1], 50);
      }

      // Extract business item (종목)
      const businessItemMatch = normalized.match(
        /종목\s*[:：]?\s*([가-힣a-zA-Z0-9\s,]+?)(?:\s+주소|$)/i
      );
      if (businessItemMatch) {
        fields.businessItem = cleanText(businessItemMatch[1], 100);
      }

      // Extract address (주소) from 사업장소재지 or 본점소재지
      // Format: "사업장소재지 : 서울특별시 동대문구 정릉천동로 133, 1층 3호(제기동)"
      const businessLocationMatch = normalized.match(
        /사업장소재지\s*[:：]\s*([가-힣a-zA-Z0-9\s,()\-]+?)(?:\s+사업의\s*종류|업태|종목|$)/i
      );
      if (businessLocationMatch) {
        fields.address = cleanText(businessLocationMatch[1], 200);
      } else {
        // Try with space: "사업장 소재지"
        const businessLocationMatch2 = normalized.match(
          /사업장\s*소재지\s*[:：]?\s*([가-힣a-zA-Z0-9\s,()\-]+?)(?:\s+사업의\s*종류|업태|종목|$)/i
        );
        if (businessLocationMatch2) {
          fields.address = cleanText(businessLocationMatch2[1], 200);
        } else {
          // Try 본점소재지
          const headOfficeMatch = normalized.match(
            /본점소재지\s*[:：]?\s*([가-힣a-zA-Z0-9\s,()\-]+?)(?:\s+사업의\s*종류|업태|종목|$)/i
          );
          if (headOfficeMatch) {
            fields.address = cleanText(headOfficeMatch[1], 200);
          } else {
            // Fallback to 주소
            const addressMatch = normalized.match(
              /주소\s*[:：]?\s*([가-힣a-zA-Z0-9\s,()\-]+?)(?:\s+\d{3}[-]?\d{2}[-]?\d{5}|$)/i
            );
            if (addressMatch) {
              fields.address = cleanText(addressMatch[1], 200);
            }
          }
        }
      }

      // Log extracted fields
      const extractedFields = Object.keys(fields).filter(k => k !== 'rawText');
      this.logger.log(`Parsed business certificate fields: ${extractedFields.join(', ')}`);
      
      // Log missing critical fields
      if (!fields.representativeName) {
        this.logger.warn('⚠️ representativeName not extracted from OCR');
      }
      if (!fields.openingDate) {
        this.logger.warn('⚠️ openingDate not extracted from OCR');
      }
      if (!fields.businessNumber) {
        this.logger.warn('⚠️ businessNumber not extracted from OCR');
      }
    } catch (error) {
      this.logger.error("Error parsing business certificate text", error);
    }

    return fields;
  }
}

