import { Injectable, Logger } from "@nestjs/common";

export interface ParsedBusinessCertificateFields {
  companyName?: string;        // 회사명
  businessNumber?: string;    // 사업자등록번호
  representativeName?: string; // 대표자명
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
      // Format: "명 : 소은숙" or "대표자명 : ..."
      const repNameMatch1 = normalized.match(
        /명\s*[:：]\s*([가-힣]+?)(?:\s+생년월일|개업연월일|업태|$)/i
      );
      if (repNameMatch1) {
        fields.representativeName = cleanText(repNameMatch1[1], 30);
      } else {
        const repNameMatch = normalized.match(
          /대표자\s*명\s*[:：]?\s*([가-힣]+?)(?:\s+업태|$)/i
        );
        if (repNameMatch) {
          fields.representativeName = cleanText(repNameMatch[1], 30);
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

      this.logger.log(`Parsed business certificate fields: ${Object.keys(fields).filter(k => k !== 'rawText').join(', ')}`);
    } catch (error) {
      this.logger.error("Error parsing business certificate text", error);
    }

    return fields;
  }
}

