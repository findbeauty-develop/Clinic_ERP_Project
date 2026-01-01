import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SolapiMessageService } from "solapi";

@Injectable()
export class SolapiProvider {
  private readonly logger = new Logger(SolapiProvider.name);
  private messageService: SolapiMessageService | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("SOLAPI_API_KEY");
    const apiSecret = this.configService.get<string>("SOLAPI_API_SECRET");
    const fromNumber = this.configService.get<string>("SOLAPI_FROM_NUMBER");

    if (apiKey && apiSecret) {
      try {
        this.messageService = new SolapiMessageService(apiKey, apiSecret);
        this.logger.log(
          "[SolapiProvider] ✅ Solapi provider initialized successfully"
        );
      } catch (error: any) {
        this.logger.error(
          `[SolapiProvider] ❌ Failed to initialize Solapi: ${error.message}`,
          error.stack
        );
      }
    } else {
      this.logger.warn(
        "[SolapiProvider] ⚠️ Solapi credentials not configured. SMS will not work. Please set SOLAPI_API_KEY and SOLAPI_API_SECRET in .env file"
      );
    }
  }

  async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {
      if (!this.messageService) {
        this.logger.warn(
          "[SolapiProvider] ❌ Solapi message service not initialized. Check SOLAPI_API_KEY and SOLAPI_API_SECRET in .env"
        );
        return false;
      }

      const fromNumber = this.configService.get<string>("SOLAPI_FROM_NUMBER");
      if (!fromNumber) {
        this.logger.warn(
          "[SolapiProvider] ❌ Solapi from number not configured. Please set SOLAPI_FROM_NUMBER in .env"
        );
        return false;
      }

      this.logger.log(
        `[SolapiProvider] Sending SMS to ${phoneNumber} from ${fromNumber}`
      );

      // Remove any non-numeric characters (Solapi accepts Korean local format like 01012345678)
      const formattedPhone = phoneNumber.replace(/[^\d]/g, "");

      const result = await this.messageService.send({
        to: formattedPhone,
        from: fromNumber,
        text: message,
      });

      // Check if result is successful
      const groupInfo = (result as any)?.groupInfo;

      // Log the result for debugging
      this.logger.debug(
        `Solapi response for ${formattedPhone}: ${JSON.stringify(result)}`
      );

      if (groupInfo) {
        // Check multiple success indicators
        const hasGroupId = !!groupInfo.groupId;
        const isSending =
          groupInfo.status === "SENDING" || groupInfo.status === "COMPLETE";
        const hasRegisteredSuccess = groupInfo.count?.registeredSuccess > 0;
        const hasSentSuccess = groupInfo.count?.sentSuccess > 0;
        const hasDateSent = !!groupInfo.dateSent;

        // If any of these conditions are true, SMS was accepted/sent
        if (
          hasGroupId ||
          isSending ||
          hasRegisteredSuccess ||
          hasSentSuccess ||
          hasDateSent
        ) {
          this.logger.log(
            `SMS sent successfully to ${formattedPhone} (status: ${groupInfo.status}, registeredSuccess: ${groupInfo.count?.registeredSuccess})`
          );
          return true;
        }
      }

      // Fallback checks
      if (result && (result as any).successCount > 0) {
        this.logger.log(`SMS sent successfully to ${formattedPhone}`);
        return true;
      } else if (result && (result as any).groupId) {
        // Alternative: if groupId exists, message was sent
        this.logger.log(`SMS sent successfully to ${formattedPhone}`);
        return true;
      } else {
        this.logger.warn(
          `SMS send failed to ${formattedPhone}: ${JSON.stringify(result)}`
        );
        return false;
      }
    } catch (error: any) {
      this.logger.error(
        `Error sending SMS to ${phoneNumber}: ${error.message}`
      );
      return false;
    }
  }
}
