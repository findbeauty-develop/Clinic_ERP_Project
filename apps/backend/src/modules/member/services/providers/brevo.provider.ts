// apps/backend/src/modules/member/services/providers/brevo.provider.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IEmailProvider } from "../email-provider.interface";
import * as SibApiV3Sdk from "@sendinblue/client";

@Injectable()
export class BrevoProvider implements IEmailProvider {
  private readonly logger = new Logger(BrevoProvider.name);
  private apiInstance: SibApiV3Sdk.TransactionalEmailsApi | null = null;
  private fromEmail: string | null = null;
  private fromName: string | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("BREVO_API_KEY");
    const fromEmail = this.configService.get<string>("BREVO_FROM_EMAIL");
    const fromName =
      this.configService.get<string>("BREVO_FROM_NAME") || "Clinic ERP";

    if (apiKey && fromEmail) {
      try {
        this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        this.apiInstance.setApiKey(
          SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
          apiKey
        );
        this.fromEmail = fromEmail;
        this.fromName = fromName;
        this.logger.log("Brevo provider initialized");
      } catch (error) {
        this.logger.error(`Failed to initialize Brevo: ${error}`);
      }
    } else {
      this.logger.warn("Brevo credentials not configured");
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    htmlBody: string,
    textBody?: string
  ): Promise<boolean> {
    try {
      if (!this.apiInstance || !this.fromEmail) {
        this.logger.warn("Brevo service not initialized");
        return false;
      }

      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.sender = {
        email: this.fromEmail,
        name: this.fromName || undefined,
      };
      sendSmtpEmail.to = [{ email: to }];
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.htmlContent = htmlBody;
      if (textBody) {
        sendSmtpEmail.textContent = textBody;
      }

      const result = await this.apiInstance.sendTransacEmail(sendSmtpEmail);

      if (result.response.statusCode === 201) {
        this.logger.log(
          `Brevo email sent to ${to} (MessageId: ${result.body.messageId})`
        );
        return true;
      } else {
        this.logger.warn(
          `Brevo email failed with status: ${result.response.statusCode}`
        );
        return false;
      }
    } catch (error: any) {
      this.logger.error(
        `Brevo email failed: ${error?.message || "Unknown error"}`
      );
      if (error?.response?.body) {
        this.logger.error(
          `Brevo Error Details: ${JSON.stringify(error.response.body)}`
        );
      }
      return false;
    }
  }
}
