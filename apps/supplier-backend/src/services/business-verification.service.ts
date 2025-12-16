import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface BusinessVerificationRequest {
  businessNumber: string;      // 사업자등록번호 (10 digits, no dashes)
  representativeName: string;  // 대표자성명 (exact as on certificate)
  openingDate: string;        // 개업일자 (YYYYMMDD format, no dashes)
  representativeName2?: string; // 대표자성명2 (only for foreign businesses, optional)
}

export interface BusinessVerificationResponse {
  isValid: boolean;
  businessStatus?: string;    // 계속사업자, 휴업자, 폐업자
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
    this.apiKey = this.configService.get<string>('DATA_GO_KR_API_KEY') || '';
    // API URL - should be actual endpoint, not docs URL
    // If .env has docs URL (with api-docs or openapi.do), use default endpoint
    const envUrl = this.configService.get<string>('DATA_GO_KR_API_URL') || '';
    // Detect documentation/file URLs (not actual API endpoints)
    if (envUrl.includes('api-docs') || 
        envUrl.includes('openapi.do') || 
        envUrl.includes('fileData.do') ||
        envUrl.includes('/data/') && !envUrl.includes('/api/')) {
      // Documentation/file URL detected - use default endpoint
      // User needs to update .env with actual API endpoint from data.go.kr
      this.apiUrl = 'https://infuser.odcloud.kr/api/stages/28493/v1/businesses';
      this.logger.warn(`⚠️ DATA_GO_KR_API_URL in .env is a documentation/file URL: ${envUrl}`);
      this.logger.warn(`Using default endpoint: ${this.apiUrl}`);
      this.logger.warn('Please update DATA_GO_KR_API_URL in .env with the actual API endpoint URL from data.go.kr');
      this.logger.warn('The API endpoint should look like: https://infuser.odcloud.kr/api/stages/{STAGE_ID}/v1/businesses');
    } else if (envUrl) {
      this.apiUrl = envUrl;
    } else {
      // Default fallback
      this.apiUrl = 'https://www.data.go.kr/data/15060992/fileData.do';
    }
    
    if (!this.apiKey) {
      this.logger.warn('DATA_GO_KR_API_KEY is not configured in .env file');
      this.logger.warn('Business verification will fail. Please add DATA_GO_KR_API_KEY to apps/supplier-backend/.env');
    } else {
      this.logger.log(`Business verification service initialized with URL: ${this.apiUrl}`);
    }
  }

  /**
   * 사업자등록번호 진위확인
   * @param request Verification request with businessNumber, representativeName, openingDate
   * @returns Verification result
   */
  async verifyBusinessNumber(
    request: BusinessVerificationRequest
  ): Promise<BusinessVerificationResponse> {
    if (!this.apiKey) {
      this.logger.error('DATA_GO_KR_API_KEY is not configured');
      return {
        isValid: false,
        error: 'API key is not configured',
      };
    }

    // Validate required fields
    if (!request.businessNumber || !request.representativeName || !request.openingDate) {
      return {
        isValid: false,
        error: '사업자등록번호, 대표자성명, 개업일자는 필수입니다',
      };
    }

    // Format business number (remove dashes, ensure 10 digits)
    const cleanBusinessNumber = request.businessNumber.replace(/-/g, '').trim();
    
    if (cleanBusinessNumber.length !== 10 || !/^\d{10}$/.test(cleanBusinessNumber)) {
      return {
        isValid: false,
        error: '사업자등록번호는 10자리 숫자여야 합니다',
      };
    }

    // Validate opening date format (YYYYMMDD)
    if (!/^\d{8}$/.test(request.openingDate)) {
      return {
        isValid: false,
        error: '개업일자는 YYYYMMDD 형식이어야 합니다',
      };
    }

    // Clean representative name (remove extra spaces, but keep as-is from OCR)
    const cleanRepresentativeName = request.representativeName.trim();

    try {
      // Decode serviceKey if it's URL-encoded (data.go.kr sometimes provides encoded keys)
      let decodedServiceKey = this.apiKey;
      try {
        // Try to decode - if it's already decoded, this won't change it
        decodedServiceKey = decodeURIComponent(this.apiKey);
      } catch (e) {
        // If decoding fails, use original
        decodedServiceKey = this.apiKey;
      }

      // Build request parameters
      // Based on actual API: b_no, p_nm, start_dt are required
      const params = new URLSearchParams({
        serviceKey: decodedServiceKey,
        b_no: cleanBusinessNumber,           // 사업자등록번호 (10 digits)
        p_nm: cleanRepresentativeName,      // 대표자성명
        start_dt: request.openingDate,      // 개업일자 (YYYYMMDD)
      });

      // Add p_nm2 only for foreign businesses (empty string if not provided)
      // According to requirements: "필수가 아닌 항목을 사용하지 않을 경우 JSON에서 삭제하지 말고 빈 문자열("")로 포함"
      if (request.representativeName2 !== undefined) {
        params.append('p_nm2', request.representativeName2 || '');
      } else {
        // For non-foreign businesses, send empty string
        params.append('p_nm2', '');
      }

      const requestUrl = `${this.apiUrl}?${params.toString()}`;
      
      this.logger.log(`Verifying business number: ${cleanBusinessNumber}, representative: ${cleanRepresentativeName}, opening date: ${request.openingDate}`);
      this.logger.debug(`API URL: ${this.apiUrl}`);
      this.logger.debug(`Service key length: ${decodedServiceKey.length} (first 10 chars: ${decodedServiceKey.substring(0, 10)}...)`);
      
      // Make API request (try both GET and POST)
      let response: Response;
      let responseData: any;

      // Try GET first
      try {
        response = await fetch(requestUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          // Clone response to read error text without consuming the body
          const responseClone = response.clone();
          let errorText = '';
          try {
            errorText = await responseClone.text();
          } catch (e) {
            errorText = `Failed to read error response: ${e}`;
          }
          
          this.logger.warn(`GET request failed: ${response.status} ${response.statusText}`);
          this.logger.warn(`Error response: ${errorText.substring(0, 1000)}`);
          this.logger.warn(`Request URL: ${requestUrl}`);
          
          // Try POST as fallback (only if GET failed)
          try {
            const postResponse = await fetch(this.apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                serviceKey: decodedServiceKey,
                b_no: cleanBusinessNumber,
                p_nm: cleanRepresentativeName,
                start_dt: request.openingDate,
                p_nm2: request.representativeName2 || '',
              }),
            });
            
            if (postResponse.ok) {
              // POST succeeded, use this response
              response = postResponse;
            } else {
              // POST also failed
              const postResponseClone = postResponse.clone();
              let postErrorText = '';
              try {
                postErrorText = await postResponseClone.text();
              } catch (e) {
                postErrorText = `Failed to read POST error response: ${e}`;
              }
              this.logger.error(`POST request also failed: ${postResponse.status} ${postResponse.statusText}`);
              this.logger.error(`POST error response: ${postErrorText.substring(0, 1000)}`);
              
              // Return error - both GET and POST failed
              if (response.status === 404 || postResponse.status === 404) {
                this.logger.error('⚠️ API endpoint returned 404 Not Found');
                this.logger.error('This usually means:');
                this.logger.error('1. The API endpoint URL is incorrect');
                this.logger.error('2. The API path structure has changed');
                this.logger.error('3. The service key is invalid or expired');
                this.logger.error(`Current endpoint: ${this.apiUrl}`);
                this.logger.error('Please check:');
                this.logger.error('- Verify DATA_GO_KR_API_URL in .env matches the actual API endpoint from data.go.kr');
                this.logger.error('- Check if the API requires a different path format');
                this.logger.error('- Verify your service key is active and has proper permissions');
              }
              
              return {
                isValid: false,
                error: `API request failed: GET (${response.status}) and POST (${postResponse.status}) both failed. ${errorText.substring(0, 200)}. If you see 404, please verify DATA_GO_KR_API_URL in .env file.`,
              };
            }
          } catch (postError: any) {
            this.logger.error('POST request failed with exception', postError);
            return {
              isValid: false,
              error: `API request failed: GET (${response.status}) and POST (${postError?.message || 'exception'}) both failed. ${errorText.substring(0, 200)}`,
            };
          }
        }

        // At this point, response should be ok (either GET succeeded or POST succeeded)
        if (!response.ok) {
          const responseClone = response.clone();
          let errorText = '';
          try {
            errorText = await responseClone.text();
          } catch (e) {
            errorText = `Failed to read error response: ${e}`;
          }
          this.logger.error(`API request failed: ${response.status} ${response.statusText}`);
          this.logger.error(`Full error response: ${errorText}`);
          this.logger.error(`Request URL: ${requestUrl}`);
          return {
            isValid: false,
            error: `API request failed: ${response.status}. ${errorText.substring(0, 200)}`,
          };
        }

        // Parse response (could be JSON or XML)
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          responseData = await response.json();
        } else if (contentType.includes('text/xml') || contentType.includes('application/xml')) {
          // XML response - need to parse
          const xmlText = await response.text();
          this.logger.warn('XML response received, parsing...');
          // For now, try to parse as JSON if it's actually JSON in XML wrapper
          try {
            responseData = JSON.parse(xmlText);
          } catch {
            // If not JSON, we need xml2js library
            this.logger.error('XML parsing not yet implemented. Please install xml2js or fast-xml-parser');
            return {
              isValid: false,
              error: 'XML response format not yet supported. Please check API documentation.',
            };
          }
        } else if (contentType.includes('text/html')) {
          // HTML response - usually means wrong endpoint or error page
          const htmlText = await response.text();
          this.logger.error(`⚠️ API returned HTML instead of JSON. This usually means:`);
          this.logger.error(`1. The endpoint URL is incorrect (404 error page)`);
          this.logger.error(`2. The API requires different authentication`);
          this.logger.error(`3. The service key format is wrong`);
          this.logger.error(`Response status: ${response.status}`);
          this.logger.error(`Content-Type: ${contentType}`);
          this.logger.error(`HTML preview (first 500 chars): ${htmlText.substring(0, 500)}`);
          
          // Try to extract error message from HTML
          let errorMessage = 'API returned HTML instead of JSON';
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
            this.logger.error(`Response preview (first 500 chars): ${text.substring(0, 500)}`);
            return {
              isValid: false,
              error: `Unknown response format: ${contentType}. Response preview: ${text.substring(0, 200)}`,
            };
          }
        }

        // Parse response based on actual API structure
        const isValid = this.parseVerificationResponse(responseData);
        
        if (isValid) {
          const businessStatus = this.extractBusinessStatus(responseData);
          this.logger.log(`Business number ${cleanBusinessNumber} is valid. Status: ${businessStatus}`);
          return {
            isValid: true,
            businessStatus,
            businessStatusCode: this.extractBusinessStatusCode(responseData),
            data: responseData,
          };
        } else {
          this.logger.warn(`Business number ${cleanBusinessNumber} verification failed - data mismatch`);
          return {
            isValid: false,
            error: '사업자등록번호, 대표자성명, 개업일자가 일치하지 않습니다',
            data: responseData,
          };
        }
      } catch (fetchError: any) {
        this.logger.error('Error making API request', fetchError);
        return {
          isValid: false,
          error: fetchError?.message || 'API request failed',
        };
      }
    } catch (error: any) {
      this.logger.error('Error verifying business number', error);
      return {
        isValid: false,
        error: error?.message || 'Unknown error occurred',
      };
    }
  }

  /**
   * Parse API response to determine if business number is valid
   * Adjust this based on actual API response structure
   */
  private parseVerificationResponse(data: any): boolean {
    // Example response structure (adjust based on actual API):
    // {
    //   response: {
    //     header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
    //     body: {
    //       items: [{
    //         b_stt: "01", // 01 = 계속사업자, 02 = 휴업자, 03 = 폐업자
    //         b_stt_cd: "01",
    //         tax_type: "부가가치세 일반과세자",
    //         ...
    //       }]
    //     }
    //   }
    // }

    try {
      // Check if response has valid structure
      if (!data) {
        this.logger.warn('Response data is null or undefined');
        return false;
      }

      // Actual API response structure: { "businesses": [...] }
      let businesses: any[] = [];
      
      if (data.businesses) {
        // Main structure: { "businesses": [...] }
        businesses = Array.isArray(data.businesses) 
          ? data.businesses 
          : [data.businesses];
      } else if (data.response?.body?.items) {
        // Alternative structure: { "response": { "body": { "items": [...] } } }
        businesses = Array.isArray(data.response.body.items) 
          ? data.response.body.items 
          : [data.response.body.items];
      } else if (data.body?.items) {
        businesses = Array.isArray(data.body.items) 
          ? data.body.items 
          : [data.body.items];
      } else if (data.items) {
        businesses = Array.isArray(data.items) ? data.items : [data.items];
      } else if (Array.isArray(data)) {
        businesses = data;
      }

      if (businesses.length === 0) {
        this.logger.warn('No businesses found in API response');
        this.logger.warn(`Response structure: ${JSON.stringify(Object.keys(data)).substring(0, 200)}`);
        return false;
      }

      // If we have businesses array with data, verification is successful (all 3 fields matched)
      this.logger.log(`Found ${businesses.length} business(es) in response`);
      return true;
    } catch (error) {
      this.logger.error('Error parsing verification response', error);
      return false;
    }
  }

  /**
   * Extract business status from response
   */
  private extractBusinessStatus(data: any): string {
    try {
      let businesses: any[] = [];
      
      if (data.businesses) {
        businesses = Array.isArray(data.businesses) 
          ? data.businesses 
          : [data.businesses];
      } else if (data.response?.body?.items) {
        businesses = Array.isArray(data.response.body.items) 
          ? data.response.body.items 
          : [data.response.body.items];
      } else if (data.body?.items) {
        businesses = Array.isArray(data.body.items) 
          ? data.body.items 
          : [data.body.items];
      } else if (data.items) {
        businesses = Array.isArray(data.items) ? data.items : [data.items];
      }

      if (businesses.length === 0) {
        return '알 수 없음';
      }

      const businessInfo = businesses[0];
      // Check for status fields (may vary by API)
      const statusCode = businessInfo.b_stt || businessInfo.b_stt_cd || businessInfo.status;
      
      switch (statusCode) {
        case '01':
          return '계속사업자';
        case '02':
          return '휴업자';
        case '03':
          return '폐업자';
        default:
          // If no status code, assume active (verification passed)
          return statusCode || '계속사업자';
      }
    } catch (error) {
      this.logger.error('Error extracting business status', error);
      return '알 수 없음';
    }
  }

  /**
   * Extract business status code from response
   */
  private extractBusinessStatusCode(data: any): string | undefined {
    try {
      let businesses: any[] = [];
      
      if (data.businesses) {
        businesses = Array.isArray(data.businesses) 
          ? data.businesses 
          : [data.businesses];
      } else if (data.response?.body?.items) {
        businesses = Array.isArray(data.response.body.items) 
          ? data.response.body.items 
          : [data.response.body.items];
      } else if (data.body?.items) {
        businesses = Array.isArray(data.body.items) 
          ? data.body.items 
          : [data.body.items];
      } else if (data.items) {
        businesses = Array.isArray(data.items) ? data.items : [data.items];
      }

      if (businesses.length === 0) {
        return undefined;
      }

      const businessInfo = businesses[0];
      return businessInfo.b_stt || businessInfo.b_stt_cd || businessInfo.status;
    } catch (error) {
      return undefined;
    }
  }
}

