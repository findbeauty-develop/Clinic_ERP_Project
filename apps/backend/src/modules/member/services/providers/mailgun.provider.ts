// apps/backend/src/modules/member/services/providers/mailgun.provider.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IEmailProvider } from "../email-provider.interface";
import FormData from "form-data";
import Mailgun from "mailgun.js";

@Injectable()
export class MailgunProvider implements IEmailProvider {
  private readonly logger = new Logger(MailgunProvider.name);
  private mailgun: any = null;
  private domain: string | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("MAILGUN_API_KEY");
    const domain = this.configService.get<string>("MAILGUN_DOMAIN");

    if (apiKey && domain) {
      try {
        const mailgunClient = new Mailgun(FormData);
        this.mailgun = mailgunClient.client({
          username: "api",
          key: apiKey,
        });
        this.domain = domain;
        this.logger.log("Mailgun provider initialized");
      } catch (error) {
        this.logger.error(`Failed to initialize Mailgun: ${error}`);
      }
    } else {
      this.logger.warn("Mailgun credentials not configured");
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    htmlBody: string,
    textBody?: string
  ): Promise<boolean> {
    try {
      if (!this.mailgun || !this.domain) {
        this.logger.warn("Mailgun service not initialized");
        return false;
      }

      const fromEmail =
        this.configService.get<string>("MAILGUN_FROM_EMAIL") ||
        `noreply@${this.domain}`;

      const messageData = {
        from: fromEmail,
        to: [to],
        subject: subject,
        html: htmlBody,
        ...(textBody && { text: textBody }),
      };

      const result = await this.mailgun.messages.create(
        this.domain,
        messageData
      );

      if (result.id) {
        this.logger.log(
          `Mailgun email sent to ${to} (MessageId: ${result.id})`
        );
        return true;
      } else {
        this.logger.warn(`Mailgun email failed: ${JSON.stringify(result)}`);
        return false;
      }
    } catch (error: any) {
      this.logger.error(
        `Mailgun email failed: ${error?.message || "Unknown error"}`
      );
      if (error?.statusCode) {
        this.logger.error(`Mailgun Error Status: ${error.statusCode}`);
      }
      return false;
    }
  }
}
