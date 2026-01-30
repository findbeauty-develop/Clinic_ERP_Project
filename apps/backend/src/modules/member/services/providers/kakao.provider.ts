import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IMessageProvider } from "../message-provider.interface";

@Injectable()
export class KakaoProvider implements IMessageProvider {
  private readonly logger = new Logger(KakaoProvider.name);

  constructor(private configService: ConfigService) {}

  async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    // KakaoTalk Business API SMS'ni qo'llab-quvvatlamaydi
    this.logger.warn("KakaoTalk Business API does not support SMS");
    return false;
  }

  async sendKakaoTalk(phoneNumber: string, message: string): Promise<boolean> {
    try {
      const apiKey = this.configService.get<string>("KAKAO_API_KEY");
      const templateId = this.configService.get<string>("KAKAO_TEMPLATE_ID");

      if (!apiKey) {
        this.logger.warn("KakaoTalk API key not configured");
        return false;
      }

      const frontendUrl =
        this.configService.get<string>("FRONTEND_URL") ||
        "https://clinic.jaclit.com";

      const response = await fetch(
        "https://kapi.kakao.com/v2/api/talk/message/default/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            receiver_uuids: [phoneNumber],
            template_object: {
              object_type: "text",
              text: message,
              link: {
                web_url: frontendUrl,
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `KakaoTalk API error: ${response.statusText} - ${errorText}`
        );
      }

      this.logger.log(`KakaoTalk sent to ${phoneNumber}`);
      return true;
    } catch (error) {
      this.logger.error(`KakaoTalk failed: ${error}`);
      return false;
    }
  }
}
