import { Injectable, Logger } from "@nestjs/common";

export interface ParsedCertificateFields {
  clinicName?: string;
  clinicType?: string;
  address?: string;
  department?: string;
  openDate?: string;
  doctorName?: string;
  doctorLicenseNo?: string;
  reportNumber?: string;
  rawText: string;
}

@Injectable()
export class CertificateParserService {
  private readonly logger = new Logger(CertificateParserService.name);

  /**
   * Parse Korean clinic certificate text and extract key fields
   * @param rawText Raw OCR text from certificate image
   * @returns Parsed fields object
   */
  parseKoreanClinicCertificate(rawText: string): ParsedCertificateFields {
    // Normalize whitespace: replace multiple spaces/newlines with single space
    const normalized = rawText
      .replace(/\s+/g, " ")
      .replace(/\n+/g, " ")
      .trim();

    const fields: ParsedCertificateFields = {
      rawText: normalized,
    };

    try {
      // Helper function to clean extracted text (remove extra words/phrases)
      const cleanText = (text: string, maxLength: number = 100): string => {
        return text.trim().substring(0, maxLength).trim();
      };

      // Extract clinic name (명칭) - pattern: "명 칭" or "명칭" followed by clinic name
      // Example: "명 칭 닥터정리반의원" -> "닥터정리반의원"
      const clinicNameMatch = normalized.match(
        /명\s*칭\s+([가-힣a-zA-Z0-9\s]+?)(?:\s+종\s*류|$)/i
      );
      if (clinicNameMatch) {
        fields.clinicName = cleanText(clinicNameMatch[1], 50);
      }

      // Extract clinic type (종류) - pattern: "종 류" or "종류" followed by type
      // Example: "종 류 의원" -> "의원"
      const clinicTypeMatch = normalized.match(
        /종\s*류\s+([가-힣]+?)(?:\s+의료기관|$)/i
      );
      if (clinicTypeMatch) {
        fields.clinicType = cleanText(clinicTypeMatch[1], 20);
      }

      // Extract address (소재지) - pattern: "소재지" followed by address until next field
      // Example: "소재지 서울특별시 강남구 압구정로 320, 극동Gallery 4층 (신사동)" -> "서울특별시 강남구 압구정로 320, 극동Gallery 4층 (신사동)"
      const addressMatch = normalized.match(
        /(?:의료기관\s+)?소재지\s+([가-힣a-zA-Z0-9\s,()\-]+?)(?:\s+\d+\s+개설자|$)/i
      );
      if (addressMatch) {
        // Remove trailing numbers and "개설자"
        let address = addressMatch[1].trim();
        address = address.replace(/\s+\d+\s*$/, "").trim();
        fields.address = cleanText(address, 200);
      }

      // Extract department/medical subjects (진료과목) - pattern: "진료과목" followed by department
      // Example: "진료과목 피부과" -> "피부과"
      const departmentMatch = normalized.match(
        /진료과목\s+([가-힣]+?)(?:\s+개설신고일자|$)/i
      );
      if (departmentMatch) {
        fields.department = cleanText(departmentMatch[1], 30);
      }

      // Extract open date (개설신고일자) - format: YYYY년MM월DD일
      const dateMatch = normalized.match(
        /개설신고일자\s+(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/i
      );
      if (dateMatch) {
        const year = dateMatch[1];
        const month = dateMatch[2].padStart(2, "0");
        const day = dateMatch[3].padStart(2, "0");
        fields.openDate = `${year}-${month}-${day}`;
      }

      // Extract doctor name (성명) - pattern: "성명(법인명) 정연호" -> "정연호"
      // Try multiple patterns to handle different formats
      let doctorNameMatch = normalized.match(
        /성명\s*\(?법인명\)?\s+([가-힣]+?)(?:\s+생년월일|\s+\d{4}년|\s+주소|$)/i
      );
      
      // If not found, try pattern: "성명(법인명) 정연호 생년월일"
      if (!doctorNameMatch) {
        doctorNameMatch = normalized.match(
          /성명\s*\(법인명\)\s+([가-힣]+?)(?:\s+생년월일|$)/i
        );
      }
      
      // If not found, try without parentheses: "성명 법인명 정연호"
      if (!doctorNameMatch) {
        doctorNameMatch = normalized.match(
          /성명\s+법인명\s+([가-힣]+?)(?:\s+생년월일|$)/i
        );
      }
      
      // If not found, try just "성명 정연호"
      if (!doctorNameMatch) {
        doctorNameMatch = normalized.match(
          /성명\s+([가-힣]+?)(?:\s+생년월일|\s+\d{4}년|$)/i
        );
      }
      
      // If still not found, try to find Korean name after "성명" or "법인명" (2-4 characters)
      if (!doctorNameMatch) {
        doctorNameMatch = normalized.match(
          /(?:성명|법인명)[\s(]*법인명[\s)]*\s+([가-힣]{2,4})(?:\s|$)/i
        );
      }
      
      if (doctorNameMatch) {
        let doctorName = doctorNameMatch[1].trim();
        // Remove "법인명" if it appears in the extracted text
        doctorName = doctorName.replace(/\(?법인명\)?/gi, "").trim();
        // Remove extra spaces and take only the name part (usually first 2-4 characters for Korean names)
        doctorName = doctorName.split(/\s+/)[0].trim();
        // Remove any trailing numbers or dates
        doctorName = doctorName.replace(/\s+\d+.*$/, "").trim();
        fields.doctorName = cleanText(doctorName, 30);
      }

      // Extract doctor license number (면허번호) - pattern: "면허번호 제 53132호" -> "53132" or "제 53132호"
      const licenseNoMatch = normalized.match(
        /면허번호\s+제\s*(\d+)\s*호/i
      );
      if (licenseNoMatch) {
        fields.doctorLicenseNo = licenseNoMatch[1].trim();
      } else {
        // Fallback: try without "제" and "호"
        const licenseNoMatch2 = normalized.match(
          /면허번호\s+(\d+)/i
        );
        if (licenseNoMatch2) {
          fields.doctorLicenseNo = licenseNoMatch2[1].trim();
        }
      }

      // Extract report number (문서발급번호) - pattern: "문서발급번호: 21132-21421-00430-04009"
      const reportNumberMatch = normalized.match(
        /문서발급번호\s*[:：]\s*([0-9\-]+)/i
      );
      if (reportNumberMatch) {
        fields.reportNumber = reportNumberMatch[1].trim();
      }

      this.logger.log(`Parsed certificate fields: ${Object.keys(fields).filter(k => k !== 'rawText').join(', ')}`);
    } catch (error) {
      this.logger.error("Error parsing certificate text", error);
    }

    return fields;
  }
}

