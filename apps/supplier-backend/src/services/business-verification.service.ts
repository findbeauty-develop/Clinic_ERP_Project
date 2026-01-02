import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataGoKrBusinessFormat } from "./business-certificate-parser.service";

export interface BusinessVerificationRequest {
  businessNumber: string; // 사업자등록번호 (10 digits, no dashes) - REQUIRED
  representativeName?: string; // 대표자성명 (optional)
  openingDate?: string; // 개업일자 (YYYYMMDD format, no dashes) - optional
  companyName?: string; // 사업자명 (optional)
  corporateNumber?: string; // 법인등록번호 (13 digits, no dashes) - optional
  // Can also accept DataGoKrBusinessFormat directly
  dataGoKrFormat?: DataGoKrBusinessFormat;
}

export interface BusinessVerificationResponse {
  isValid: boolean;
  businessStatus?: string; // 계속사업자, 휴업자, 폐업자
  businessStatusCode?: string; // 01 = 계속사업자, 02 = 휴업자, 03 = 폐업자
  data?: any;
  error?: string;
}

@Injectable()
export class BusinessVerificationService {
  private readonly logger = new Logger(BusinessVerificationService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>("DATA_GO_KR_API_KEY") || "";
    // API URL - should be actual endpoint, not docs URL
    // If .env has docs URL (with api-docs or openapi.do), use default endpoint
    const envUrl = this.configService.get<string>("DATA_GO_KR_API_URL") || "";
    // Detect documentation/file URLs (not actual API endpoints)
    if (
      envUrl.includes("api-docs") ||
      envUrl.includes("openapi.do") ||
      envUrl.includes("fileData.do") ||
      (envUrl.includes("/data/") && !envUrl.includes("/api/"))
    ) {
      // Documentation/file URL detected - use default endpoint
      // User needs to update .env with actual API endpoint from data.go.kr
      this.apiUrl = "https://infuser.odcloud.kr/api/stages/28493/v1/businesses";
      this.logger.warn(
        `⚠️ DATA_GO_KR_API_URL in .env is a documentation/file URL: ${envUrl}`
      );
      this.logger.warn(`Using default endpoint: ${this.apiUrl}`);
      this.logger.warn(
        "Please update DATA_GO_KR_API_URL in .env with the actual API endpoint URL from data.go.kr"
      );
      this.logger.warn(
        "The API endpoint should look like: https://infuser.odcloud.kr/api/stages/{STAGE_ID}/v1/businesses"
      );
    } else if (envUrl) {
      this.apiUrl = envUrl;
    } else {
      // Default fallback
      this.apiUrl = "https://www.data.go.kr/data/15060992/fileData.do";
    }

    if (!this.apiKey) {
      this.logger.warn("DATA_GO_KR_API_KEY is not configured in .env file");
      this.logger.warn(
        "Business verification will fail. Please add DATA_GO_KR_API_KEY to apps/supplier-backend/.env"
      );
    } else {
      this.logger.log(
        `Business verification service initialized with URL: ${this.apiUrl}`
      );
    }
  }

  /**
   * 사업자등록번호 진위확인
   * @param request Verification request with businessNumber (required), and optional fields
   * @returns Verification result
   */
  async verifyBusinessNumber(
    request: BusinessVerificationRequest
  ): Promise<BusinessVerificationResponse> {
    if (!this.apiKey) {
      this.logger.error("DATA_GO_KR_API_KEY is not configured");
      return {
        isValid: false,
        error: "API key is not configured",
      };
    }

    // Validate required field: businessNumber is mandatory
    if (!request.businessNumber) {
      return {
        isValid: false,
        error: "사업자등록번호는 필수입니다",
      };
    }

    // Format business number (remove dashes, ensure 10 digits)
    const cleanBusinessNumber = request.businessNumber.replace(/-/g, "").trim();

    if (
      cleanBusinessNumber.length !== 10 ||
      !/^\d{10}$/.test(cleanBusinessNumber)
    ) {
      return {
        isValid: false,
        error: "사업자등록번호는 10자리 숫자여야 합니다",
      };
    }

    // Strategy: Try /validate first (full verification with all fields)
    // If it fails or returns invalid, fallback to /status (simple check with only b_no)

    // First attempt: /validate endpoint with full data
    const validateResult = await this.tryValidateEndpoint(
      request,
      cleanBusinessNumber
    );

    if (validateResult.isValid) {
      this.logger.log(`✅ Verification successful via /validate endpoint`);
      return validateResult;
    }

    // If /validate failed, try /status endpoint
    this.logger.log(
      `⚠️ /validate failed or invalid. Trying /status endpoint as fallback...`
    );
    const statusResult = await this.tryStatusEndpoint(cleanBusinessNumber);

    if (statusResult.isValid) {
      this.logger.log(`✅ Verification successful via /status endpoint`);
      return statusResult;
    }

    // Both methods failed
    this.logger.error(`❌ Both /validate and /status verification failed`);
    return {
      isValid: false,
      error:
        validateResult.error ||
        statusResult.error ||
        "사업자등록번호 확인에 실패했습니다",
      data: {
        validateResult: validateResult.data,
        statusResult: statusResult.data,
      },
    };
  }

  /**
   * Try /validate endpoint with full business data
   */
  private async tryValidateEndpoint(
    request: BusinessVerificationRequest,
    cleanBusinessNumber: string
  ): Promise<BusinessVerificationResponse> {
    try {
      // Use DataGoKrBusinessFormat if provided, otherwise build from individual fields
      let dataGoKrFormat: DataGoKrBusinessFormat;

      if (request.dataGoKrFormat) {
        dataGoKrFormat = request.dataGoKrFormat;
      } else {
        // Build format from individual fields (all optional except b_no)
        dataGoKrFormat = {
          b_no: cleanBusinessNumber,
          start_dt: request.openingDate || "",
          p_nm: request.representativeName || "",
          p_nm2: "",
          b_nm: request.companyName || "",
          corp_no: request.corporateNumber?.replace(/-/g, "").trim() || "",
          b_sector: "",
          b_type: "",
          b_adr: "",
        };
      }

      // Validate opening date format if provided (YYYYMMDD)
      if (dataGoKrFormat.start_dt && !/^\d{8}$/.test(dataGoKrFormat.start_dt)) {
        return {
          isValid: false,
          error: "개업일자는 YYYYMMDD 형식이어야 합니다",
        };
      }

      // Decode serviceKey if it's URL-encoded (data.go.kr sometimes provides encoded keys)
      let decodedServiceKey = this.apiKey;
      try {
        // Try to decode - if it's already decoded, this won't change it
        decodedServiceKey = decodeURIComponent(this.apiKey);
      } catch (e) {
        // If decoding fails, use original
        decodedServiceKey = this.apiKey;
      }

      // Build POST URL with serviceKey in query parameters
      // data.go.kr API uses POST method with serviceKey in query params and data in body
      // For verification, use /validate endpoint (not /status)
      let apiEndpoint = this.apiUrl;
      if (apiEndpoint.endsWith("/status")) {
        // Replace /status with /validate for verification
        apiEndpoint = apiEndpoint.replace("/status", "/validate");
      }

      const postParams = new URLSearchParams({
        serviceKey: decodedServiceKey,
      });
      const postUrl = `${apiEndpoint}?${postParams.toString()}`;

      // Make API request using POST method (data.go.kr API requires POST)
      let response: Response;
      let responseData: any;

      try {
        // API requires businesses array format: { "businesses": [{ "b_no": "xxxxxxx", ... }] }
        // b_no is a string, not an array!
        const requestBody: any = {
          businesses: [
            {
              b_no: dataGoKrFormat.b_no, // String, not array!
              start_dt: dataGoKrFormat.start_dt || "",
              p_nm: dataGoKrFormat.p_nm || "",
              p_nm2: dataGoKrFormat.p_nm2 || "",
              b_nm: dataGoKrFormat.b_nm || "",
              corp_no: dataGoKrFormat.corp_no || "",
              b_sector: dataGoKrFormat.b_sector || "",
              b_type: dataGoKrFormat.b_type || "",
              b_adr: dataGoKrFormat.b_adr || "",
            },
          ],
        };

        // Add timeout to prevent hanging (60 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
          response = await fetch(postUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === "AbortError") {
            this.logger.error("Request timeout after 60 seconds");
            return {
              isValid: false,
              error: "API 요청 시간 초과 (60초). 잠시 후 다시 시도해주세요.",
            };
          }
          throw fetchError;
        }

        if (!response.ok) {
          // Clone response to read error text without consuming the body
          const responseClone = response.clone();
          let errorText = "";
          try {
            errorText = await responseClone.text();
          } catch (e) {
            errorText = `Failed to read error response: ${e}`;
          }

          // Return error

          return {
            isValid: false,
            error: `API request failed: ${
              response.status
            }. ${errorText.substring(
              0,
              200
            )}. If you see 404, please verify DATA_GO_KR_API_URL in .env file.`,
          };
        }

        // Parse response (could be JSON or XML)
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          responseData = await response.json();
        } else if (
          contentType.includes("text/xml") ||
          contentType.includes("application/xml")
        ) {
          // XML response - need to parse
          const xmlText = await response.text();
          this.logger.warn("XML response received, parsing...");
          // For now, try to parse as JSON if it's actually JSON in XML wrapper
          try {
            responseData = JSON.parse(xmlText);
          } catch {
            // If not JSON, we need xml2js library
            this.logger.error(
              "XML parsing not yet implemented. Please install xml2js or fast-xml-parser"
            );
            return {
              isValid: false,
              error:
                "XML response format not yet supported. Please check API documentation.",
            };
          }
        } else if (contentType.includes("text/html")) {
          // HTML response - usually means wrong endpoint or error page
          const htmlText = await response.text();
          this.logger.error(
            `⚠️ API returned HTML instead of JSON. This usually means:`
          );
          this.logger.error(
            `1. The endpoint URL is incorrect (404 error page)`
          );
          this.logger.error(`2. The API requires different authentication`);
          this.logger.error(`3. The service key format is wrong`);
          this.logger.error(`Response status: ${response.status}`);
          this.logger.error(`Content-Type: ${contentType}`);
          this.logger.error(
            `HTML preview (first 500 chars): ${htmlText.substring(0, 500)}`
          );

          // Try to extract error message from HTML
          let errorMessage = "API returned HTML instead of JSON";
          const titleMatch = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
          const h1Match = htmlText.match(/<h1[^>]*>([^<]+)<\/h1>/i);
          const errorMatch = htmlText.match(/error[^>]*>([^<]+)<\/[^>]*>/i);

          if (titleMatch) {
            errorMessage += ` - ${titleMatch[1]}`;
          } else if (h1Match) {
            errorMessage += ` - ${h1Match[1]}`;
          } else if (errorMatch) {
            errorMessage += ` - ${errorMatch[1]}`;
          }

          return {
            isValid: false,
            error: `${errorMessage}. Please verify DATA_GO_KR_API_URL in .env file. Current URL: ${this.apiUrl}`,
          };
        } else {
          // Try to parse as JSON anyway (for other content types)
          const text = await response.text();
          try {
            responseData = JSON.parse(text);
          } catch {
            this.logger.error(`Unknown response format: ${contentType}`);
            this.logger.error(
              `Response preview (first 500 chars): ${text.substring(0, 500)}`
            );
            return {
              isValid: false,
              error: `Unknown response format: ${contentType}. Response preview: ${text.substring(
                0,
                200
              )}`,
            };
          }
        }

        // Log full response for debugging

        // Parse response based on actual API structure
        // Check status_code === "OK" and valid === "01"
        const verificationResult = this.parseVerificationResponse(responseData);

        if (verificationResult.isValid) {
          const businessStatus = this.extractBusinessStatus(responseData);
          this.logger.log(
            `✅ Business number  is valid. Status: ${businessStatus}`
          );
          return {
            isValid: true,
            businessStatus,
            businessStatusCode: this.extractBusinessStatusCode(responseData),
            data: responseData,
          };
        } else {
          return {
            isValid: false,
            error:
              verificationResult.error ||
              "사업자등록번호 진위확인에 실패했습니다",
            data: responseData,
          };
        }
      } catch (fetchError: any) {
        this.logger.error("Error making /validate API request", fetchError);
        return {
          isValid: false,
          error: fetchError?.message || "/validate API request failed",
        };
      }
    } catch (error: any) {
      this.logger.error("Error in tryValidateEndpoint", error);
      return {
        isValid: false,
        error: error?.message || "Unknown error in /validate",
      };
    }
  }

  /**
   * Try /status endpoint with only business number
   * Simpler check - only requires b_no
   */
  private async tryStatusEndpoint(
    cleanBusinessNumber: string
  ): Promise<BusinessVerificationResponse> {
    try {
      // Decode serviceKey if it's URL-encoded
      let decodedServiceKey = this.apiKey;
      try {
        decodedServiceKey = decodeURIComponent(this.apiKey);
      } catch (e) {
        decodedServiceKey = this.apiKey;
      }

      // Build /status endpoint URL
      let apiEndpoint = this.apiUrl;
      if (apiEndpoint.endsWith("/validate")) {
        // Replace /validate with /status
        apiEndpoint = apiEndpoint.replace("/validate", "/status");
      } else if (!apiEndpoint.endsWith("/status")) {
        // If neither /validate nor /status, assume base URL and append /status
        apiEndpoint = apiEndpoint.replace(/\/+$/, "") + "/status";
      }

      const postParams = new URLSearchParams({
        serviceKey: decodedServiceKey,
      });
      const postUrl = `${apiEndpoint}?${postParams.toString()}`;

      // Make API request using POST method
      // /status endpoint requires: { "b_no": ["xxxxxxx"] } - b_no as array of strings
      const requestBody = {
        b_no: [cleanBusinessNumber], // Array format for /status endpoint
      };

      // Add timeout to prevent hanging (60 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let response: Response;
      try {
        response = await fetch(postUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === "AbortError") {
          this.logger.error("Status request timeout after 60 seconds");
          return {
            isValid: false,
            error: "API 요청 시간 초과 (60초). 잠시 후 다시 시도해주세요.",
          };
        }
        throw fetchError;
      }

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(
          `/status request failed: ${response.status} ${response.statusText}`
        );
        this.logger.warn(`Error response: ${errorText.substring(0, 500)}`);
        return {
          isValid: false,
          error: `/status API 요청 실패: ${response.status}`,
        };
      }

      // Parse JSON response
      const responseData: any = await response.json();
      // this.logger.debug(
      //   `Status API response: ${JSON.stringify(responseData, null, 2)}`
      // );

      // Parse /status response
      // Expected structure:
      // {
      //   "request_cnt": 1,
      //   "match_cnt": 1,
      //   "status_code": "OK",
      //   "data": [{
      //     "b_no": "4728703085",
      //     "b_stt": "계속사업자",
      //     "b_stt_cd": "01",
      //     "tax_type": "부가가치세 일반과세자",
      //     "tax_type_cd": "01",
      //     ...
      //   }]
      // }

      if (responseData.status_code !== "OK") {
        this.logger.warn(
          `/status API status_code is not OK: ${responseData.status_code}`
        );
        return {
          isValid: false,
          error: `사업자 상태 확인 중 오류 발생 (status_code: ${responseData.status_code})`,
          data: responseData,
        };
      }

      if (
        !responseData.data ||
        !Array.isArray(responseData.data) ||
        responseData.data.length === 0
      ) {
        this.logger.warn("No data in /status API response");
        return {
          isValid: false,
          error: "사업자 정보를 찾을 수 없습니다",
          data: responseData,
        };
      }

      const businessData = responseData.data[0];

      // Check b_stt_cd (사업자 상태 코드)
      // "01" = 계속사업자 (valid/active)
      // Other codes = 휴업자/폐업자 (invalid/inactive)
      const businessStatusCode = businessData.b_stt_cd;
      const businessStatus = businessData.b_stt;

      this.logger.debug(
        `Business status: ${businessStatus} (code: ${businessStatusCode})`
      );

      // For /status endpoint, we only check if b_stt_cd === "01"
      // We don't have "valid" field in /status response
      if (businessStatusCode !== "01") {
        this.logger.warn(
          `Business is not active. Status: ${businessStatus} (${businessStatusCode})`
        );
        return {
          isValid: false,
          error: `현재 영업 중이 아닌 사업자입니다 (${businessStatus})`,
          businessStatus,
          businessStatusCode,
          data: responseData,
        };
      }

      // Success! Business is active

      return {
        isValid: true,
        businessStatus,
        businessStatusCode,
        data: responseData,
      };
    } catch (error: any) {
      this.logger.error("Error in tryStatusEndpoint", error);
      return {
        isValid: false,
        error: error?.message || "/status API 요청 중 오류 발생",
      };
    }
  }

  /**
   * Parse API response to determine if business number is valid
   * Response structure:
   * {
   *   "request_cnt": 1,
   *   "valid_cnt": 1,
   *   "status_code": "OK",
   *   "data": [
   *     {
   *       "b_no": "4728703085",
   *       "valid": "01",  // "01" = valid, anything else = invalid
   *       "status": {
   *         "b_stt_cd": "01"  // "01" = 계속사업자, "02" = 휴업자, "03" = 폐업자
   *       }
   *     }
   *   ]
   * }
   */
  private parseVerificationResponse(data: any): {
    isValid: boolean;
    error?: string;
  } {
    try {
      // Check if response has valid structure
      if (!data) {
        this.logger.warn("Response data is null or undefined");
        return {
          isValid: false,
          error: "API 응답 데이터가 없습니다",
        };
      }

      // Step 1: Check status_code === "OK"
      if (data.status_code !== "OK") {
        this.logger.warn(`API status_code is not OK: ${data.status_code}`);
        return {
          isValid: false,
          error: `사업자 정보 확인 중 오류 발생 (status_code: ${data.status_code})`,
        };
      }

      // Step 2: Check if data array exists and has at least one item
      if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
        this.logger.warn("No data array or empty data array in API response");
        this.logger.warn(
          `Response structure: ${JSON.stringify(Object.keys(data)).substring(
            0,
            200
          )}`
        );
        return {
          isValid: false,
          error: "사업자 정보를 찾을 수 없습니다",
        };
      }

      const businessData = data.data[0];

      // Log businessData for debugging

      // Step 3: Check valid === "01" (CRITICAL - 진위확인)
      // Note: valid field might be in different location or format
      const validValue =
        businessData.valid || businessData.validity || businessData.isValid;

      if (validValue !== "01" && validValue !== true) {
        const validMsg =
          businessData.valid_msg ||
          businessData.validity_msg ||
          businessData.message ||
          "사업자등록번호가 유효하지 않습니다";
        this.logger.warn(
          `Business number is invalid. valid: ${validValue}, businessData keys: ${Object.keys(
            businessData
          ).join(", ")}`
        );
        this.logger.warn(`Full businessData: ${JSON.stringify(businessData)}`);
        return {
          isValid: false,
          error: validMsg || "사업자등록번호가 유효하지 않습니다",
        };
      }

      // Step 4: Check businessStatusCode (b_stt_cd) === "01" (CRITICAL - 계속사업자)
      // Only 계속사업자 (01) is allowed, 휴업자 (02) and 폐업자 (03) should be rejected
      const businessStatusCode =
        businessData.status?.b_stt_cd || businessData.b_stt_cd;

      if (businessStatusCode !== "01") {
        const statusMessage =
          businessData.status?.b_stt ||
          (businessStatusCode === "02"
            ? "휴업자"
            : businessStatusCode === "03"
            ? "폐업자"
            : "영업 중이 아닌 사업자");

        this.logger.warn(
          `Business is not active (계속사업자). Status code: ${businessStatusCode}, Status: ${statusMessage}`
        );
        return {
          isValid: false,
          error: `현재 영업 중이 아닌 사업자입니다 (${statusMessage}). 계속사업자만 등록 가능합니다.`,
        };
      }

      // If we reach here, valid === "01" AND businessStatusCode === "01" (진위확인 + 계속사업자 passed)
      this.logger.log(
        `✅ Business verification passed (valid: ${businessData.valid}, status: ${businessStatusCode})`
      );
      return { isValid: true };
    } catch (error: any) {
      this.logger.error("Error parsing verification response", error);
      return {
        isValid: false,
        error: `응답 파싱 중 오류 발생: ${error?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Extract business status from response
   * Response structure: { "data": [{ "status": { "b_stt": "계속사업자", "b_stt_cd": "01" } }] }
   */
  private extractBusinessStatus(data: any): string {
    try {
      if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
        return "알 수 없음";
      }

      const businessInfo = data.data[0];
      const status = businessInfo.status;

      if (status?.b_stt) {
        return status.b_stt; // "계속사업자", "휴업자", "폐업자"
      }

      // Fallback to status code mapping
      const statusCode = status?.b_stt_cd;
      switch (statusCode) {
        case "01":
          return "계속사업자";
        case "02":
          return "휴업자";
        case "03":
          return "폐업자";
        default:
          return statusCode || "알 수 없음";
      }
    } catch (error) {
      this.logger.error("Error extracting business status", error);
      return "알 수 없음";
    }
  }

  /**
   * Extract business status code from response
   * Response structure: { "data": [{ "status": { "b_stt_cd": "01" } }] }
   */
  private extractBusinessStatusCode(data: any): string | undefined {
    try {
      if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
        return undefined;
      }

      const businessInfo = data.data[0];
      return businessInfo.status?.b_stt_cd;
    } catch (error) {
      return undefined;
    }
  }
}
