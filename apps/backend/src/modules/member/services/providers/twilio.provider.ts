import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IMessageProvider } from "../message-provider.interface";

@Injectable()
export class TwilioProvider implements IMessageProvider {
  private readonly logger = new Logger(TwilioProvider.name);

  constructor(private configService: ConfigService) {}

  async sendSMS(phoneNumber: string, message: string, isCritical?: boolean): Promise<boolean> {
    try {
      const accountSid = this.configService.get<string>("TWILIO_ACCOUNT_SID");
      const authToken = this.configService.get<string>("TWILIO_AUTH_TOKEN");
      const fromNumber = this.configService.get<string>("TWILIO_FROM_NUMBER");

      if (!accountSid || !authToken || !fromNumber) {
        this.logger.warn("Twilio credentials not configured");
        return false;
      }

      // Twilio SDK ishlatish uchun @twilio/client package kerak
      // npm install twilio
      const client = require("twilio")(accountSid, authToken);
      await client.messages.create({
        body: message,
        from: fromNumber,
        to: phoneNumber,
      });

      this.logger.log(`Twilio SMS sent to ${phoneNumber}`);
      return true;
    } catch (error) {
      this.logger.error(`Twilio SMS failed: ${error}`);
      return false;
    }
  }

  async sendKakaoTalk(phoneNumber: string, message: string): Promise<boolean> {
    // Twilio KakaoTalk'ni qo'llab-quvvatlamaydi
    this.logger.warn("Twilio does not support KakaoTalk");
    return false;
  }
}
