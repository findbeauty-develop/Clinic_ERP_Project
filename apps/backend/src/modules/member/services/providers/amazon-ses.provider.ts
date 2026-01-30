// apps/backend/src/modules/member/services/providers/amazon-ses.provider.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IEmailProvider } from "../email-provider.interface";
import * as AWS from "aws-sdk";

@Injectable()
export class AmazonSESProvider implements IEmailProvider {
  private readonly logger = new Logger(AmazonSESProvider.name);
  private ses: AWS.SES | null = null;

  constructor(private configService: ConfigService) {
    const accessKeyId = this.configService.get<string>("AWS_ACCESS_KEY_ID");
    const secretAccessKey = this.configService.get<string>(
      "AWS_SECRET_ACCESS_KEY"
    );
    const region = this.configService.get<string>("AWS_REGION") || "us-east-1";

    if (accessKeyId && secretAccessKey) {
      try {
        this.ses = new AWS.SES({
          accessKeyId,
          secretAccessKey,
          region,
        });
        this.logger.log("Amazon SES provider initialized");
      } catch (error) {
        this.logger.error(`Failed to initialize Amazon SES: ${error}`);
      }
    } else {
      this.logger.warn("Amazon SES credentials not configured");
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    htmlBody: string,
    textBody?: string
  ): Promise<boolean> {
    try {
      if (!this.ses) {
        this.logger.warn("Amazon SES service not initialized");
        return false;
      }

      const fromEmail = this.configService.get<string>("AWS_SES_FROM_EMAIL");
      if (!fromEmail) {
        this.logger.warn("Amazon SES from email not configured");
        return false;
      }

      const params: AWS.SES.SendEmailRequest = {
        Source: fromEmail,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: {
            Data: subject,
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: htmlBody,
              Charset: "UTF-8",
            },
            ...(textBody && {
              Text: {
                Data: textBody,
                Charset: "UTF-8",
              },
            }),
          },
        },
      };

      const result = await this.ses.sendEmail(params).promise();

      if (result.MessageId) {
        return true;
      } else {
        this.logger.warn(`Amazon SES email failed: ${JSON.stringify(result)}`);
        return false;
      }
    } catch (error: any) {
      this.logger.error(
        `Amazon SES email failed: ${error?.message || "Unknown error"}`
      );
      if (error?.code) {
        this.logger.error(`AWS Error Code: ${error.code}`);
      }
      return false;
    }
  }
}
