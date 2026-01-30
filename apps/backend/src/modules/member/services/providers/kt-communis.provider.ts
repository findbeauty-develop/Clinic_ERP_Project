import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IMessageProvider } from "../message-provider.interface";

@Injectable()
export class KTCommunisProvider implements IMessageProvider {
  private readonly logger = new Logger(KTCommunisProvider.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly fromNumber: string;
  private readonly kakaoTemplateCode?: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>("KT_COMMUNIS_API_KEY") || "";
    this.apiSecret =
      this.configService.get<string>("KT_COMMUNIS_API_SECRET") || "";
    this.fromNumber =
      this.configService.get<string>("KT_COMMUNIS_FROM_NUMBER") || "";
    this.kakaoTemplateCode = this.configService.get<string>(
      "KT_COMMUNIS_KAKAO_TEMPLATE_CODE"
    );
  }

  async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {
      if (!this.apiKey || !this.apiSecret || !this.fromNumber) {
        this.logger.warn("KT Communis credentials not configured");
        return false;
      }

      // KT Communis SMS API endpoint
      // API documentation'dan to'g'ri endpoint va format'ni oling
      const response = await fetch(
        "https://api.communis.kt.co.kr/sms/v1/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`, // yoki KT Communis'ning auth format'i
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: phoneNumber,
            from: this.fromNumber,
            message: message,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `KT Communis SMS error: ${response.statusText} - ${errorText}`
        );
      }

      this.logger.log(`KT Communis SMS sent to ${phoneNumber}`);
      return true;
    } catch (error) {
      this.logger.error(`KT Communis SMS failed: ${error}`);
      return false;
    }
  }

  async sendKakaoTalk(phoneNumber: string, message: string): Promise<boolean> {
    try {
      if (!this.apiKey || !this.apiSecret) {
        this.logger.warn("KT Communis credentials not configured");
        return false;
      }

      if (!this.kakaoTemplateCode) {
        this.logger.warn("KT Communis KakaoTalk template code not configured");
        return false;
      }

      // KT Communis 카카오 비즈메시지 API endpoint
      const response = await fetch(
        "https://api.communis.kt.co.kr/kakao/v1/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`, // yoki KT Communis'ning auth format'i
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: phoneNumber,
            template_code: this.kakaoTemplateCode,
            message: message,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `KT Communis KakaoTalk error: ${response.statusText} - ${errorText}`
        );
      }

      this.logger.log(`KT Communis KakaoTalk sent to ${phoneNumber}`);
      return true;
    } catch (error) {
      this.logger.error(`KT Communis KakaoTalk failed: ${error}`);
      return false;
    }
  }
}
