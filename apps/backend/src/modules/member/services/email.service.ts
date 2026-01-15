// apps/backend/src/modules/member/services/email.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IEmailProvider } from "./email-provider.interface";
import { AmazonSESProvider } from "./providers/amazon-ses.provider";
import { BrevoProvider } from "./providers/brevo.provider"; // ✅ Import qo'shing

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private provider: IEmailProvider;

  constructor(
    private configService: ConfigService,
    private amazonSESProvider: AmazonSESProvider,
    private brevoProvider: BrevoProvider
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

      case "brevo":
      case "sendinblue":
        return this.brevoProvider;
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
  /* Reset-ish (email friendly) */
  body {
    margin: 0 !important;
    padding: 0 !important;
    background: #f3f5f7;
    font-family: Arial, sans-serif;
    color: #1f2937;
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
  }

  /* Container */
  .container {
    width: 100%;
    background: #f3f5f7;
    padding: 24px 12px;
  }

  .card {
    max-width: 620px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
  }

  /* Header */
  .header {
    background: #4c5eaf;
    padding: 28px 22px;
    text-align: center;
    color: #ffffff;
  }

  .header h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  .header p {
    margin: 8px 0 0;
    font-size: 13px;
    opacity: 0.9;
  }

  /* Content */
  .content {
    padding: 22px;
    background: #ffffff;
  }

  .muted {
    color: #6b7280;
    font-size: 13px;
    margin: 0 0 14px;
  }

  /* Sections */
  .section {
    background: #f9fafb;
    border: 1px solid #eef2f7;
    border-radius: 12px;
    padding: 14px;
    margin: 14px 0;
  }

  .section-title {
    font-size: 14px;
    font-weight: 700;
    margin: 0 0 10px;
    color: #111827;
  }

  .row {
    font-size: 13px;
    margin: 8px 0;
  }

  .label {
    color: #6b7280;
  }

  /* Product list */
  .product-item {
    padding: 10px 0;
    border-top: 1px solid #e5e7eb;
    font-size: 13px;
  }

  .product-item:first-child {
    border-top: none;
    padding-top: 0;
  }

  .price {
    font-weight: 700;
    color: #111827;
  }

  /* CTA button */
  .btn-wrap {
    text-align: center;
    padding: 10px 0 4px;
  }

  .button {
    display: inline-block;
    background: #108274;
    color: #ffffff !important;
    text-decoration: none;
    padding: 12px 18px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 14px;
  }

  /* Footer */
  .footer {
    text-align: center;
    padding: 18px 18px 22px;
    font-size: 12px;
    color: #6b7280;
    background: #ffffff;
  }

  .divider {
    height: 1px;
    background: #e5e7eb;
    margin: 16px 0;
  }
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

  /**
   * Return notification'ni email orqali supplier'ga yuborish
   */
  async sendReturnNotificationEmail(
    email: string,
    clinicName: string,
    returnNo: string,
    totalAmount: number,
    itemCount: number,
    clinicManagerName?: string,
    products?: Array<{ productName: string; brand: string; quantity: number }>,
    returnType?: string // "반품", "교환", "불량" etc.
  ): Promise<boolean> {
    if (!email) {
      this.logger.warn("Email address is required for return notification");
      return false;
    }

    const { subject, htmlBody, textBody } = this.formatReturnNotificationEmail(
      clinicName,
      returnNo,
      totalAmount,
      itemCount,
      clinicManagerName,
      products,
      returnType
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
          `Return notification email sent to ${email} for return ${returnNo}`
        );
      } else {
        this.logger.warn(
          `Failed to send return notification email to ${email}`
        );
      }
      return emailSent;
    } catch (error: any) {
      this.logger.error(
        `Error sending return notification email: ${
          error?.message || "Unknown error"
        }`
      );
      return false;
    }
  }

  /**
   * Return notification email format
   */
  private formatReturnNotificationEmail(
    clinicName: string,
    returnNo: string,
    totalAmount: number,
    itemCount: number,
    clinicManagerName?: string,
    products?: Array<{ productName: string; brand: string; quantity: number }>,
    returnType?: string
  ): { subject: string; htmlBody: string; textBody: string } {
    const returnTypeText = returnType || "반품/교환";
    const subject = `[${returnTypeText} 알림] ${clinicName}에서 ${returnTypeText} 요청이 접수되었습니다`;

    // HTML body
    let htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
  /* Reset-ish (email friendly) */
  body {
    margin: 0 !important;
    padding: 0 !important;
    background: #f3f5f7;
    font-family: Arial, sans-serif;
    color: #1f2937;
    -webkit-text-size-adjust: 100%;
    -ms-text-size-adjust: 100%;
  }

  /* Container */
  .container {
    width: 100%;
    background: #f3f5f7;
    padding: 24px 12px;
  }

  .card {
    max-width: 620px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
  }

  /* Header */
  .header {
    background: #4c5eaf;
    padding: 28px 22px;
    text-align: center;
    color: #ffffff;
  }

  .header h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  .header p {
    margin: 8px 0 0;
    font-size: 13px;
    opacity: 0.9;
  }

  /* Content */
  .content {
    padding: 22px;
    background: #ffffff;
  }

  .muted {
    color: #6b7280;
    font-size: 13px;
    margin: 0 0 14px;
  }

  /* Sections */
  .section {
    background: #f9fafb;
    border: 1px solid #eef2f7;
    border-radius: 12px;
    padding: 14px;
    margin: 14px 0;
  }

  .section-title {
    font-size: 14px;
    font-weight: 700;
    margin: 0 0 10px;
    color: #111827;
  }

  .row {
    font-size: 13px;
    margin: 8px 0;
  }

  .label {
    color: #6b7280;
  }

  /* Product list */
  .product-item {
    padding: 10px 0;
    border-top: 1px solid #e5e7eb;
    font-size: 13px;
  }

  .product-item:first-child {
    border-top: none;
    padding-top: 0;
  }

  .price {
    font-weight: 700;
    color: #111827;
  }

  /* CTA button */
  .btn-wrap {
    text-align: center;
    padding: 10px 0 4px;
  }

  .button {
    display: inline-block;
    background: #108274;
    color: #ffffff !important;
    text-decoration: none;
    padding: 12px 18px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 14px;
  }

  /* Footer */
  .footer {
    text-align: center;
    padding: 18px 18px 22px;
    font-size: 12px;
    color: #6b7280;
    background: #ffffff;
  }

  .divider {
    height: 1px;
    background: #e5e7eb;
    margin: 16px 0;
  }
</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${returnTypeText} 알림</h1>
          </div>
          <div class="content">
            <div class="return-info">
              <h2>${clinicName}에서 ${returnTypeText} 요청이 접수되었습니다</h2>
              <p><strong>반품번호:</strong> ${returnNo}</p>
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
                <h3>${returnTypeText} 제품 목록:</h3>
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
              }/returns" class="button">
                ${returnTypeText} 확인하기
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
    let textBody = `[${returnTypeText} 알림] ${clinicName}에서 ${returnTypeText} 요청이 접수되었습니다.\n\n`;
    textBody += `반품번호: ${returnNo}\n`;
    if (clinicManagerName) {
      textBody += `담당자: ${clinicManagerName}\n`;
    }
    if (products && products.length > 0) {
      textBody += `\n${returnTypeText} 제품:\n`;
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
    }/returns`;

    return { subject, htmlBody, textBody };
  }
}
