import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeAddress, compareAddresses, extractSidoCode, extractSgguCode, extractEmdongNm } from '../../../common/utils/address-normalizer.util';
import { normalizeDate, compareDates } from '../../../common/utils/date-normalizer.util';
import { fuzzyMatchClinicName, compareClinicTypes } from '../../../common/utils/string-normalizer.util';

export interface HiraSearchParams {
  yadmNm?: string; // 의료기관명
  sidoCd?: string; // 시도코드
  sgguCd?: string; // 시군구코드
  emdongNm?: string; // 읍면동명
  clcd?: string; // 종별코드
  pageNo?: number;
  numOfRows?: number;
}

export interface HiraHospitalInfo {
  yadmNm?: string; // 의료기관명
  addr?: string; // 주소
  clcdNm?: string; // 종별명
  estbDd?: string; // 설립일자
  telno?: string; // 전화번호
  clCd?: string; // 종별코드
  ykiho?: string; // 의료기관기호
  [key: string]: any; // Other fields
}

export interface HiraVerificationResult {
  isValid: boolean;
  confidence: number;
  matches: {
    nameMatch: boolean;
    addressMatch: boolean;
    typeMatch: boolean;
    dateMatch: boolean;
  };
  hiraData?: HiraHospitalInfo;
  warnings: string[];
}

@Injectable()
export class HiraService {
  private readonly logger = new Logger(HiraService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('HIRA_API_KEY') || '';
    this.apiUrl = this.configService.get<string>('HIRA_API_URL') || 
      'https://apis.data.go.kr/B551182/hospInfoService/v2';
    
    if (!this.apiKey) {
      this.logger.warn('HIRA_API_KEY is not configured in .env file');
      this.logger.warn('HIRA verification will be skipped. Please add HIRA_API_KEY to apps/backend/.env');
    } else {
      this.logger.log(`HIRA service initialized with URL: ${this.apiUrl}`);
    }
  }

  /**
   * Search hospitals using HIRA API
   */
  async searchHospitals(params: HiraSearchParams): Promise<HiraHospitalInfo[]> {
    if (!this.apiKey) {
      this.logger.warn('HIRA_API_KEY not configured, skipping search');
      return [];
    }

    try {
      const searchParams = new URLSearchParams({
        serviceKey: this.apiKey,
        pageNo: String(params.pageNo || 1),
        // ❌ REMOVE numOfRows - don't send it automatically
        // numOfRows: String(params.numOfRows || 10),
      });

      // Only add numOfRows if explicitly provided
      if (params.numOfRows) {
        searchParams.append('numOfRows', String(params.numOfRows));
      }

      if (params.yadmNm) {
        searchParams.append('yadmNm', params.yadmNm);
      }
      if (params.sidoCd) {
        searchParams.append('sidoCd', params.sidoCd);
      }
      if (params.sgguCd) {
        searchParams.append('sgguCd', params.sgguCd);
      }
      if (params.emdongNm) {
        searchParams.append('emdongNm', params.emdongNm);
      }
      if (params.clcd) {
        searchParams.append('clcd', params.clcd);
      }

      const requestUrl = `${this.apiUrl}/getHospBasisList?${searchParams.toString()}`;
      
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`HIRA API request failed: ${response.status} ${response.statusText}`);
        this.logger.error(`Error response: ${errorText.substring(0, 500)}`);
        return [];
      }

      const contentType = response.headers.get('content-type') || '';
      let data: any;
      let rawResponse: string = '';

      if (contentType.includes('application/json')) {
        rawResponse = await response.text();
        data = JSON.parse(rawResponse);
      } else if (contentType.includes('text/xml') || contentType.includes('application/xml')) {
        rawResponse = await response.text();
        
        // Parse XML response properly
        try {
          // Simple XML parsing for HIRA API response structure
          // Extract items from XML
          const itemsMatch = rawResponse.match(/<items>(.*?)<\/items>/s);
          if (itemsMatch) {
            const itemsXml = itemsMatch[1];
            const itemMatches = itemsXml.match(/<item>(.*?)<\/item>/gs) || [];
            
            const items: any[] = [];
            itemMatches.forEach((itemXml: string) => {
              const item: any = {};
              // Extract common fields
              const fieldPatterns = [
                { name: 'yadmNm', pattern: /<yadmNm>(.*?)<\/yadmNm>/i }, // Add 'i' flag for case-insensitive
                { name: 'addr', pattern: /<addr>(.*?)<\/addr>/i },
                { name: 'clcdNm', pattern: /<cl[Cc]d[Nn]m>(.*?)<\/cl[Cc]d[Nn]m>/i }, // Match both clcdNm and clCdNm
                { name: 'estbDd', pattern: /<estbDd>(.*?)<\/estbDd>/i },
                { name: 'telno', pattern: /<telno>(.*?)<\/telno>/i },
                { name: 'clCd', pattern: /<clCd>(.*?)<\/clCd>/i },
                { name: 'ykiho', pattern: /<ykiho>(.*?)<\/ykiho>/i },
                { name: 'emdongNm', pattern: /<emdongNm>(.*?)<\/emdongNm>/i },
              ];
              
              fieldPatterns.forEach(({ name, pattern }) => {
                const match = itemXml.match(pattern);
                if (match && match[1]) {
                  item[name] = match[1].trim();
                }
              });
              
              // ✅ FIX: Also try case-insensitive match for clcdNm (XML has clCdNm)
              if (!item.clcdNm) {
                const clcdNmMatch = itemXml.match(/<clCdNm>(.*?)<\/clCdNm>/i);
                if (clcdNmMatch && clcdNmMatch[1]) {
                  item.clcdNm = clcdNmMatch[1].trim();
                }
              }
              
              // ✅ FIX: Also try case-insensitive match for clCdNm
              if (!item.clcdNm) {
                const clcdNmMatch = itemXml.match(/<clCdNm>(.*?)<\/clCdNm>/i);
                if (clcdNmMatch && clcdNmMatch[1]) {
                  item.clcdNm = clcdNmMatch[1].trim();
                }
              }
              
              if (Object.keys(item).length > 0) {
                items.push(item);
              }
            });
            
            data = {
              response: {
                body: {
                  items: items.length === 1 ? items[0] : items,
                },
              },
            };
          } else {
            // Fallback: try to parse as JSON if it's JSON wrapped in XML
            try {
              data = JSON.parse(rawResponse);
            } catch {
              this.logger.error('Failed to parse XML response');
              return [];
            }
          }
        } catch (error) {
          this.logger.error('Error parsing XML response', error);
          return [];
        }
      } else {
        rawResponse = await response.text();
        try {
          data = JSON.parse(rawResponse);
        } catch {
          this.logger.error(`Failed to parse response: ${contentType}`);
          return [];
        }
      }

      // Parse HIRA API response structure
      const hospitals: HiraHospitalInfo[] = [];
      
      // Try different response structures
      let items: any[] = [];
      if (data.response?.body?.items) {
        items = Array.isArray(data.response.body.items) 
          ? data.response.body.items 
          : [data.response.body.items];
      } else if (data.body?.items) {
        items = Array.isArray(data.body.items) 
          ? data.body.items 
          : [data.body.items];
      } else if (data.items) {
        items = Array.isArray(data.items) ? data.items : [data.items];
      }

      items.forEach((item: any) => {
        hospitals.push({
          yadmNm: item.yadmNm,
          addr: item.addr,
          clcdNm: item.clcdNm,
          estbDd: item.estbDd,
          telno: item.telno,
          clCd: item.clCd,
          ykiho: item.ykiho,
        });
      });

      return hospitals;
    } catch (error: any) {
      this.logger.error('Error searching HIRA API', error);
      return [];
    }
  }

  /**
   * Verify clinic information against HIRA database
   */
  async verifyClinicInfo(certificateData: {
    clinicName?: string;
    address?: string;
    clinicType?: string;
    openDate?: string;
  }): Promise<HiraVerificationResult> {
    if (!this.apiKey) {
      return {
        isValid: false,
        confidence: 0,
        matches: {
          nameMatch: false,
          addressMatch: false,
          typeMatch: false,
          dateMatch: false,
        },
        warnings: ['HIRA_API_KEY not configured'],
      };
    }

    if (!certificateData.clinicName) {
      return {
        isValid: false,
        confidence: 0,
        matches: {
          nameMatch: false,
          addressMatch: false,
          typeMatch: false,
          dateMatch: false,
        },
        warnings: ['Clinic name is required for HIRA verification'],
      };
    }

    try {
      // Search HIRA API with only 4 parameters: emdongNm, yadmNm, ServiceKey, pageNo
      const searchParams: HiraSearchParams = {
        yadmNm: certificateData.clinicName,
        pageNo: 1, // Explicitly set pageNo
        // ❌ REMOVE numOfRows - don't send it
        // numOfRows: 10,
      };

      // Extract and add emdongNm from address if available
      if (certificateData.address) {
        const emdongNm = extractEmdongNm(certificateData.address);
        if (emdongNm) {
          searchParams.emdongNm = emdongNm;
        }
      }

      // Remove sidoCd and sgguCd - we only use emdongNm, yadmNm, ServiceKey, pageNo
      const hospitals = await this.searchHospitals(searchParams);

      if (hospitals.length === 0) {
        return {
          isValid: false,
          confidence: 0,
          matches: {
            nameMatch: false,
            addressMatch: false,
            typeMatch: false,
            dateMatch: false,
          },
          warnings: [`Clinic "${certificateData.clinicName}" not found in HIRA database`],
        };
      }

      // Find best match
      const bestMatch = hospitals[0]; // For now, use first result

      // Compare fields
      const nameMatch = certificateData.clinicName 
        ? fuzzyMatchClinicName(certificateData.clinicName, bestMatch.yadmNm || '')
        : false;

      const addressMatch = certificateData.address && bestMatch.addr
        ? compareAddresses(certificateData.address, bestMatch.addr)
        : false;

      const typeMatch = certificateData.clinicType && bestMatch.clcdNm
        ? compareClinicTypes(certificateData.clinicType, bestMatch.clcdNm)
        : false;

      // Update date comparison to handle YYYYMMDD format
      const dateMatch = certificateData.openDate && bestMatch.estbDd
        ? compareDates(certificateData.openDate, bestMatch.estbDd)
        : false;

      // Calculate confidence
      const matchCount = [nameMatch, addressMatch, typeMatch, dateMatch].filter(Boolean).length;
      const totalChecks = [nameMatch, addressMatch, typeMatch, dateMatch].filter(m => m !== undefined).length;
      const confidence = totalChecks > 0 ? matchCount / totalChecks : 0;

      // Generate warnings
      const warnings: string[] = [];
      if (!nameMatch) {
        warnings.push(`Clinic name mismatch: certificate="${certificateData.clinicName}", HIRA="${bestMatch.yadmNm}"`);
      }
      if (!addressMatch && certificateData.address && bestMatch.addr) {
        warnings.push(`Address mismatch: certificate="${certificateData.address}", HIRA="${bestMatch.addr}"`);
      }
      if (!typeMatch && certificateData.clinicType && bestMatch.clcdNm) {
        warnings.push(`Clinic type mismatch: certificate="${certificateData.clinicType}", HIRA="${bestMatch.clcdNm}"`);
      }
      if (!dateMatch && certificateData.openDate && bestMatch.estbDd) {
        warnings.push(`Open date mismatch: certificate="${certificateData.openDate}", HIRA="${bestMatch.estbDd}"`);
      }

      return {
        isValid: confidence >= 0.7, // 70% match threshold
        confidence,
        matches: {
          nameMatch,
          addressMatch,
          typeMatch,
          dateMatch,
        },
        hiraData: bestMatch,
        warnings,
      };
    } catch (error: any) {
      this.logger.error('Error verifying clinic info with HIRA', error);
      return {
        isValid: false,
        confidence: 0,
        matches: {
          nameMatch: false,
          addressMatch: false,
          typeMatch: false,
          dateMatch: false,
        },
        warnings: [`HIRA verification failed: ${error?.message || 'Unknown error'}`],
      };
    }
  }
}

