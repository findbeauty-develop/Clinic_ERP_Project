// apps/backend/src/modules/member/services/email.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IEmailProvider } from "./email-provider.interface";
import { AmazonSESProvider } from "./providers/amazon-ses.provider";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private provider: IEmailProvider;

  constructor(
    private configService: ConfigService,
    private amazonSESProvider: AmazonSESProvider
  ) {
    // Config'dan provider tanlash (kelajakda boshqa provider'lar qo'shilishi mumkin)
    const providerName =
      this.configService.get<string>("EMAIL_PROVIDER") || "amazon-ses";
    this.provider = this.getProvider(providerName);
    this.logger.log(`Email provider initialized: ${providerName}`);
  }

  private getProvider(name: string): IEmailProvider {
    switch (name.toLowerCase()) {
      case "amazon-ses":
      case "ses":
        return this.amazonSESProvider;
      default:
        this.logger.warn(`Unknown email provider: ${name}, using Amazon SES`);
        return this.amazonSESProvider;
    }
  }

  /**
   * Send email using the configured provider
   */
  async sendEmail(
    to: string,
    subject: string,
    htmlBody: string,
    textBody?: string
  ): Promise<boolean> {
    try {
      const emailSent = await this.provider.sendEmail(
        to,
        subject,
        htmlBody,
        textBody
      );
      if (emailSent) {
        this.logger.log(`Email sent successfully to ${to}`);
      } else {
        this.logger.warn(`Failed to send email to ${to}`);
      }
      return emailSent;
    } catch (error: any) {
      this.logger.error(
        `Error sending email: ${error?.message || "Unknown error"}`
      );
      return false;
    }
  }

  /**
   * Order notification'ni email orqali supplier'ga yuborish
   */
  async sendOrderNotificationEmail(
    email: string,
    clinicName: string,
    orderNo: string,
    totalAmount: number,
    itemCount: number,
    clinicManagerName?: string,
    products?: Array<{ productName: string; brand: string; quantity: number }>
  ): Promise<boolean> {
    if (!email) {
      this.logger.warn("Email address is required for order notification");
      return false;
    }

    const { subject, htmlBody, textBody } = this.formatOrderNotificationEmail(
      clinicName,
      orderNo,
      totalAmount,
      itemCount,
      clinicManagerName,
      products
    );

    try {
      const emailSent = await this.sendEmail(
        email,
        subject,
        htmlBody,
        textBody
      );
      if (emailSent) {
        this.logger.log(
          `Order notification email sent to ${email} for order ${orderNo}`
        );
      } else {
        this.logger.warn(`Failed to send order notification email to ${email}`);
      }
      return emailSent;
    } catch (error: any) {
      this.logger.error(
        `Error sending order notification email: ${
          error?.message || "Unknown error"
        }`
      );
      return false;
    }
  }

  /**
   * Order notification email format
   */
  private formatOrderNotificationEmail(
    clinicName: string,
    orderNo: string,
    totalAmount: number,
    itemCount: number,
    clinicManagerName?: string,
    products?: Array<{ productName: string; brand: string; quantity: number }>
  ): { subject: string; htmlBody: string; textBody: string } {
    const subject = `[주문 알림] ${clinicName}에서 주문이 접수되었습니다`;

    // HTML body
    let htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .order-info { background-color: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
          .product-list { margin: 10px 0; }
          .product-item { padding: 8px; border-bottom: 1px solid #eee; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>주문 알림</h1>
          </div>
          <div class="content">
            <div class="order-info">
              <h2>${clinicName}에서 주문이 접수되었습니다</h2>
              <p><strong>주문번호:</strong> ${orderNo}</p>
              ${
                clinicManagerName
                  ? `<p><strong>담당자:</strong> ${clinicManagerName}</p>`
                  : ""
              }
              <p><strong>총 금액:</strong> ${totalAmount.toLocaleString(
                "ko-KR"
              )}원</p>
              <p><strong>제품 수:</strong> ${itemCount}개</p>
            </div>
            
            ${
              products && products.length > 0
                ? `
              <div class="product-list">
                <h3>주문 제품 목록:</h3>
                ${products
                  .map(
                    (p) => `
                  <div class="product-item">
                    <strong>${p.productName}${
                      p.brand ? ` (${p.brand})` : ""
                    }</strong> - 수량: ${p.quantity}
                  </div>
                `
                  )
                  .join("")}
              </div>
            `
                : ""
            }
            
            <div style="text-align: center;">
              <a href="${
                this.configService.get<string>("SUPPLIER_FRONTEND_URL") ||
                "http://localhost:3003"
              }/orders" class="button">
                주문 확인하기
              </a>
            </div>
          </div>
          <div class="footer">
            <p>자세한 내용은 공급업체 플랫폼에서 확인하세요.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Text body (fallback)
    let textBody = `[주문 알림] ${clinicName}에서 주문이 접수되었습니다.\n\n`;
    textBody += `주문번호: ${orderNo}\n`;
    if (clinicManagerName) {
      textBody += `담당자: ${clinicManagerName}\n`;
    }
    if (products && products.length > 0) {
      textBody += `\n주문 제품:\n`;
      products.forEach((p) => {
        textBody += `- ${p.productName}${
          p.brand ? ` (${p.brand})` : ""
        } - 수량: ${p.quantity}\n`;
      });
    }
    textBody += `\n총 금액: ${totalAmount.toLocaleString("ko-KR")}원\n`;
    textBody += `제품 수: ${itemCount}개\n\n`;
    textBody += `자세한 내용은 공급업체 플랫폼에서 확인하세요.\n`;
    textBody += `${
      this.configService.get<string>("SUPPLIER_FRONTEND_URL") ||
      "http://localhost:3003"
    }/orders`;

    return { subject, htmlBody, textBody };
  }
}
