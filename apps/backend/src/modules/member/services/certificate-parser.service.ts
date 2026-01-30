import { Injectable, Logger } from "@nestjs/common";

export interface ParsedCertificateFields {
  clinicName?: string;
  clinicType?: string;
  address?: string;
  department?: string; // Can be comma-separated
  openDate?: string; // Format: YYYYMMDD (e.g., "20231109")
  doctorName?: string;
  doctorLicenseNo?: string;
  licenseType?: string; // 면허종류 (e.g., "의사면허", "한의사면허")
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
    const normalized = rawText.replace(/\s+/g, " ").replace(/\n+/g, " ").trim();

    const fields: ParsedCertificateFields = {
      rawText: normalized,
    };

    try {
      // Helper function to clean extracted text (remove extra words/phrases)
      const cleanText = (text: string, maxLength: number = 100): string => {
        return text.trim().substring(0, maxLength).trim();
      };

      // Extract clinic name (명칭) - IMPROVED pattern
      // Example: "명 칭 지제이(GJ)성형외과 의원" -> "지제이(GJ)성형외과의원"
      // Try multiple patterns
      let clinicNameMatch = normalized.match(
        /명\s*칭\s+([가-힣a-zA-Z0-9()\s]+?)(?:\s+의원\s+의원|\s+종\s*류|\s+의료기관|$)/i
      );

      if (!clinicNameMatch) {
        // Alternative: "명칭" without space
        clinicNameMatch = normalized.match(
          /명칭\s+([가-힣a-zA-Z0-9()\s]+?)(?:\s+의원\s+의원|\s+종\s*류|\s+의료기관|$)/i
        );
      }

      if (clinicNameMatch) {
        let clinicName = clinicNameMatch[1].trim();
        // Remove trailing "의원" if it appears twice
        clinicName = clinicName.replace(/\s+의원\s+의원$/, "").trim();
        // Remove single trailing "의원" if it's part of the name
        clinicName = clinicName.replace(/\s+의원$/, "").trim();
        fields.clinicName = cleanText(clinicName, 50);
      }

      // Extract clinic type (종류) - IMPROVED pattern
      // Look for "의원" or "병원" after clinic name
      // Example: "지제이(GJ)성형외과 의원 의원" -> "의원"
      let clinicTypeMatch = normalized.match(
        /종\s*류\s+([가-힣]+?)(?:\s+의료기관|$)/i
      );

      if (!clinicTypeMatch) {
        // Alternative: find "의원" or "병원" after clinic name
        const afterClinicName = normalized.substring(
          normalized.indexOf(fields.clinicName || "") +
            (fields.clinicName?.length || 0)
        );
        clinicTypeMatch = afterClinicName.match(
          /\s+(의원|병원|한의원|치과의원|안과의원)/
        );
        if (clinicTypeMatch) {
          fields.clinicType = clinicTypeMatch[1];
        }
      } else {
        fields.clinicType = cleanText(clinicTypeMatch[1], 20);
      }

      // If still not found, try to find standalone "의원" or "병원"
      if (!fields.clinicType) {
        const standaloneMatch = normalized.match(
          /\b(의원|병원|한의원|치과의원|안과의원)\b/
        );
        if (standaloneMatch) {
          fields.clinicType = standaloneMatch[1];
        }
      }

      // Extract address (소재지) - IMPROVED pattern
      // Example: "의료기관 소재지 서울특별시 서초구 강남대로 527, 브랜드칸 타워 5 층 (반포동)"
      let addressMatch = normalized.match(
        /(?:의료기관\s+)?소재지\s+([가-힣a-zA-Z0-9\s,()\-]+?)(?:\s+진료과목|\s+개설신고일자|\s+개설자|$)/i
      );

      if (!addressMatch) {
        // Alternative: just "소재지" without "의료기관"
        addressMatch = normalized.match(
          /소재지\s+([가-힣a-zA-Z0-9\s,()\-]+?)(?:\s+진료과목|\s+개설신고일자|\s+개설자|$)/i
        );
      }

      if (addressMatch) {
        let address = addressMatch[1].trim();
        // Remove trailing "개설자" or numbers
        address = address.replace(/\s+개설자.*$/, "").trim();
        address = address.replace(/\s+\d+\s*$/, "").trim();
        fields.address = cleanText(address, 200);
      }

      // Extract department/medical subjects (진료과목) - IMPROVED
      // Example: "진료과목 비뇨의학과 피부과 산 부인과 성형외과"
      const departmentMatch = normalized.match(
        /진료과목\s+([가-힣,\s]+?)(?:\s+개설신고일자|$)/i
      );
      if (departmentMatch) {
        let departments = departmentMatch[1].trim();
        // Fix: "비뇨의학과 피부과 산 부인과" -> "비뇨의학과, 피부과, 산부인과"
        // Replace "산 부인과" with "산부인과"
        departments = departments.replace(/산\s+부인과/g, "산부인과");
        // Remove extra spaces around commas
        departments = departments.replace(/\s*,\s*/g, ", ");
        // Add commas between departments if missing
        departments = departments.replace(
          /([가-힣]+과)\s+([가-힣]+과)/g,
          "$1, $2"
        );
        fields.department = cleanText(departments, 100);
      }

      // Extract open date (개설신고일자) - already working
      const dateMatch = normalized.match(
        /개설신고일자\s+(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/i
      );
      if (dateMatch) {
        const year = dateMatch[1];
        const month = dateMatch[2].padStart(2, "0");
        const day = dateMatch[3].padStart(2, "0");
        fields.openDate = `${year}${month}${day}`;
      }

      // Extract doctor name (성명) - already working
      let doctorNameMatch = normalized.match(
        /성명\s*\(?법인명\)?\s+([가-힣]+?)(?:\s+생년월일|\s+\d{4}년|\s+주소|$)/i
      );

      if (!doctorNameMatch) {
        doctorNameMatch = normalized.match(
          /성명\s*\(법인명\)\s+([가-힣]+?)(?:\s+생년월일|$)/i
        );
      }

      if (!doctorNameMatch) {
        doctorNameMatch = normalized.match(
          /성명\s+법인명\s+([가-힣]+?)(?:\s+생년월일|$)/i
        );
      }

      if (!doctorNameMatch) {
        doctorNameMatch = normalized.match(
          /성명\s+([가-힣]+?)(?:\s+생년월일|\s+\d{4}년|$)/i
        );
      }

      if (doctorNameMatch) {
        let doctorName = doctorNameMatch[1].trim();
        doctorName = doctorName.replace(/\(?법인명\)?/gi, "").trim();
        doctorName = doctorName.split(/\s+/)[0].trim();
        doctorName = doctorName.replace(/\s+\d+.*$/, "").trim();
        fields.doctorName = cleanText(doctorName, 30);
      }

      // Extract doctor license number - already working
      const licenseNoMatch = normalized.match(/면허번호\s+제\s*(\d+)\s*호/i);
      if (licenseNoMatch) {
        fields.doctorLicenseNo = licenseNoMatch[1].trim();
      } else {
        const licenseNoMatch2 = normalized.match(/면허번호\s+(\d+)/i);
        if (licenseNoMatch2) {
          fields.doctorLicenseNo = licenseNoMatch2[1].trim();
        }
      }

      // Extract license type - IMPROVED
      // Example: "면허종류 의사" -> "의사면허"
      const licenseTypeMatch = normalized.match(
        /면허종류\s+([가-힣]+?)(?:\s+면허번호|$)/i
      );
      if (licenseTypeMatch) {
        let licenseType = licenseTypeMatch[1].trim();
        // If it's just "의사", add "면허"
        if (licenseType === "의사" || licenseType === "한의사") {
          licenseType = licenseType + "면허";
        }
        fields.licenseType = cleanText(licenseType, 20);
      } else {
        // Fallback: find "의사" or "한의사" before "면허번호"
        const licenseTypeMatch2 = normalized.match(
          /([가-힣]*면허|의사|한의사)(?:\s+제\s*\d+|\s+면허번호)/i
        );
        if (licenseTypeMatch2) {
          let licenseType = licenseTypeMatch2[1].trim();
          if (licenseType === "의사" || licenseType === "한의사") {
            licenseType = licenseType + "면허";
          }
          fields.licenseType = cleanText(licenseType, 20);
        }
      }

      // Extract report number - IMPROVED
      // Example: "문서발급번호: 21132-21217-00020-3200"
      const reportNumberMatch = normalized.match(
        /문서발급번호\s*[:：]\s*([0-9\-]+)/i
      );
      if (reportNumberMatch) {
        fields.reportNumber = reportNumberMatch[1].trim();
      }
    } catch (error) {
      this.logger.error("Error parsing certificate text", error);
    }

    return fields;
  }
}
