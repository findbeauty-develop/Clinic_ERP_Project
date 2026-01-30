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
   * Send email using Brevo template
   */
  async sendEmailWithTemplate(
    to: string,
    templateId: number,
    templateParams?: Record<string, any>
  ): Promise<boolean> {
    try {
      // ✅ Faqat Brevo provider template'ni qo'llab-quvvatlaydi
      if (this.provider instanceof BrevoProvider) {
        const emailSent = await (
          this.provider as BrevoProvider
        ).sendEmailWithTemplate(to, templateId, templateParams);
        if (emailSent) {
          this.logger.log(
            `✅ Template email sent successfully to ${to} using template ${templateId}`
          );
        } else {
          this.logger.warn(`Failed to send template email to ${to}`);
        }
        return emailSent;
      } else {
        this.logger.warn(
          `Template emails are only supported with Brevo provider. Current provider: ${this.provider.constructor.name}`
        );
        return false;
      }
    } catch (error: any) {
      this.logger.error(
        `Error sending template email: ${error?.message || "Unknown error"}`
      );
      return false;
    }
  }

  /**
   * Order notification'ni template bilan yuborish
   */
  async sendOrderNotificationEmailWithTemplate(
    email: string,
    templateId: number,
    clinicName: string,
    orderNo: string,
    totalAmount: number,
    itemCount: number,
    clinicManagerName?: string,
    products?: Array<{
      productName: string;
      brand: string;
      quantity: number;
      unit?: string;
    }>
  ): Promise<boolean> {
    if (!email) {
      this.logger.warn("Email address is required for order notification");
      return false;
    }

    // ✅ Template parametrlarini tayyorlash
    const templateParams: Record<string, any> = {
      clinicName,
      orderNo,
      totalAmount: totalAmount.toLocaleString("ko-KR"),
      itemCount: itemCount.toString(),
      clinicManagerName: clinicManagerName || "관리자",
      // Products array'ni string'ga aylantirish (agar template'da kerak bo'lsa)
      productsList: products
        ? products
            .map(
              (p) =>
                `${p.productName}${p.brand ? ` (${p.brand})` : ""} x${p.quantity}${p.unit ? ` ${p.unit}` : ""}`
            )
            .join(", ")
        : `${itemCount}개 제품`,
    };

    return await this.sendEmailWithTemplate(email, templateId, templateParams);
  }

  /**
   * Return notification'ni template bilan yuborish
   */
  async sendReturnNotificationEmailWithTemplate(
    email: string,
    templateId: number,
    clinicName: string,
    returnNo: string,
    totalAmount: number,
    itemCount: number,
    clinicManagerName?: string,
    products?: Array<{
      productName: string;
      brand: string;
      quantity: number;
      unit?: string;
    }>,
    returnType?: string
  ): Promise<boolean> {
    if (!email) {
      this.logger.warn("Email address is required for return notification");
      return false;
    }

    const returnTypeText = returnType || "반품/교환";

    // ✅ Template parametrlarini tayyorlash
    const templateParams: Record<string, any> = {
      clinicName,
      returnNo,
      returnType: returnTypeText,
      totalAmount: totalAmount.toLocaleString("ko-KR"),
      itemCount: itemCount.toString(),
      clinicManagerName: clinicManagerName || "관리자",
      // Products array'ni string'ga aylantirish (agar template'da kerak bo'lsa)
      productsList: products
        ? products
            .map(
              (p) =>
                `${p.productName}${p.brand ? ` (${p.brand})` : ""} x${p.quantity}${p.unit ? ` ${p.unit}` : ""}`
            )
            .join(", ")
        : `${itemCount}개 제품`,
    };

    // ✅ Har bir product uchun alohida parametrlar qo'shish (unit bilan)
    if (products && products.length > 0) {
      products.forEach((product, index) => {
        const productIndex = index + 1;
        templateParams[`product${productIndex}Name`] =
          product.productName || "";
        templateParams[`product${productIndex}Brand`] = product.brand || "";
        templateParams[`product${productIndex}Quantity`] =
          product.quantity.toString();
        templateParams[`product${productIndex}Unit`] = product.unit || "";
        // Combined format: "제품명 (브랜드) x5 개"
        templateParams[`product${productIndex}Full`] =
          `${product.productName}${product.brand ? ` (${product.brand})` : ""}  ${product.quantity}${product.unit ? ` ${product.unit}` : ""}`;
      });
    }

    return await this.sendEmailWithTemplate(email, templateId, templateParams);
  }

  /**
   * Send member credentials via email after clinic registration
   */
  async sendMemberCredentialsEmail(
    email: string,
    clinicName: string,
    members: Array<{
      memberId: string;
      role: string;
      temporaryPassword: string;
    }>
  ): Promise<boolean> {
    if (!email) {
      this.logger.warn("Email address is required for member credentials");
      return false;
    }

    const { subject, htmlBody, textBody } = this.formatMemberCredentialsEmail(
      clinicName,
      members
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
          `✅ Member credentials email sent successfully to ${email}`
        );
      } else {
        this.logger.warn(`Failed to send member credentials email to ${email}`);
      }
      return emailSent;
    } catch (error: any) {
      this.logger.error(
        `Error sending member credentials email: ${
          error?.message || "Unknown error"
        }`
      );
      return false;
    }
  }

  /**
   * Send member credentials via email using Brevo template
   */
  async sendMemberCredentialsEmailWithTemplate(
    email: string,
    templateId: number,
    clinicName: string,
    members: Array<{
      memberId: string;
      role: string;
      temporaryPassword: string;
    }>
  ): Promise<boolean> {
    if (!email) {
      this.logger.warn("Email address is required for member credentials");
      return false;
    }

    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") ||
      "https://clinic.jaclit.com";
    const cleanBaseUrl = frontendUrl.replace(/\/$/, "");

    // Template parametrlarini tayyorlash
    const templateParams: Record<string, any> = {
      clinicName,
      loginUrl: `${cleanBaseUrl}/login`,
    };

    // Har bir member'ni alohida parametr sifatida qo'shish
    members.forEach((member) => {
      if (member.role === "owner") {
        templateParams.ownerMemberId = member.memberId;
        templateParams.ownerPassword = member.temporaryPassword;
      } else if (member.role === "manager") {
        templateParams.managerMemberId = member.memberId;
        templateParams.managerPassword = member.temporaryPassword;
      } else if (member.role === "member") {
        templateParams.memberMemberId = member.memberId;
        templateParams.memberPassword = member.temporaryPassword;
      }
    });

    return await this.sendEmailWithTemplate(email, templateId, templateParams);
  }

  /**
   * Member credentials email format
   */
  private formatMemberCredentialsEmail(
    clinicName: string,
    members: Array<{
      memberId: string;
      role: string;
      temporaryPassword: string;
    }>
  ): { subject: string; htmlBody: string; textBody: string } {
    const subject = `[${clinicName}] 계정 정보`;

    // HTML body
    let htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            margin: 0;
            padding: 0;
            background: #f3f5f7;
            font-family: Arial, sans-serif;
            color: #1f2937;
          }
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
          }
          .content {
            padding: 22px;
            background: #ffffff;
          }
          .member-section {
            background: #f9fafb;
            border: 1px solid #eef2f7;
            border-radius: 12px;
            padding: 14px;
            margin: 14px 0;
          }
          .member-title {
            font-size: 14px;
            font-weight: 700;
            margin: 0 0 10px;
            color: #111827;
          }
          .member-info {
            font-size: 13px;
            margin: 8px 0;
          }
          .label {
            color: #6b7280;
            font-weight: 600;
          }
          .value {
            color: #111827;
            font-weight: 500;
          }
          .button {
            display: inline-block;
            background: #4c5eaf;
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 18px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 14px;
            margin-top: 20px;
          }
          .footer {
            text-align: center;
            padding: 18px 18px 22px;
            font-size: 12px;
            color: #6b7280;
            background: #ffffff;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <h1>${clinicName} 계정 정보</h1>
            </div>
            <div class="content">
              ${members
                .map((member) => {
                  const roleLabel =
                    member.role === "owner"
                      ? "원장"
                      : member.role === "manager"
                        ? "관리자"
                        : "직원";
                  const passwordLabel =
                    member.role === "owner" ? "비밀번호" : "임시 비밀번호";

                  return `
                    <div class="member-section">
                      <div class="member-title">${roleLabel} 계정</div>
                      <div class="member-info">
                        <span class="label">ID:</span>
                        <span class="value">${member.memberId}</span>
                      </div>
                      <div class="member-info">
                        <span class="label">${passwordLabel}:</span>
                        <span class="value">${member.temporaryPassword}</span>
                      </div>
                    </div>
                  `;
                })
                .join("")}
              
              <div style="text-align: center;">
                <a href="${
                  this.configService.get<string>("FRONTEND_URL") ||
                  "https://clinic.jaclit.com"
                }/login" class="button">
                  로그인하기
                </a>
              </div>
              
              ${
                members.some((m) => m.role !== "owner")
                  ? `<p style="font-size: 12px; color: #6b7280; margin-top: 20px; text-align: center;">
                    ※ 보안을 위해 첫 로그인 시 비밀번호를 변경해주세요.
                  </p>`
                  : `<p style="font-size: 12px; color: #6b7280; margin-top: 20px; text-align: center;">
                    ※ 비밀번호를 안전하게 보관해주세요.
                  </p>`
              }
            </div>
            <div class="footer">
              <p>이메일은 자동으로 발송되었습니다.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Text body (fallback)
    let textBody = `[${clinicName}] 계정 정보\n\n`;

    members.forEach((member) => {
      const roleLabel =
        member.role === "owner"
          ? "원장"
          : member.role === "manager"
            ? "관리자"
            : "직원";
      const passwordLabel =
        member.role === "owner" ? "비밀번호" : "임시 비밀번호";

      textBody += `${roleLabel} ID: ${member.memberId}\n`;
      textBody += `${passwordLabel}: ${member.temporaryPassword}\n\n`;
    });

    const frontendUrl =
      this.configService.get<string>("FRONTEND_URL") ||
      "https://clinic.jaclit.com";
    const cleanBaseUrl = frontendUrl.replace(/\/$/, "");
    textBody += `로그인: ${cleanBaseUrl}/login\n\n`;

    if (members.some((m) => m.role !== "owner")) {
      textBody += `※ 보안을 위해 첫 로그인 시 비밀번호를 변경해주세요.`;
    } else {
      textBody += `※ 비밀번호를 안전하게 보관해주세요.`;
    }

    return { subject, htmlBody, textBody };
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
                "https://supplier.jaclit.com"
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
      "https://supplier.jaclit.com"
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
    products?: Array<{
      productName: string;
      brand: string;
      quantity: number;
      unit?: string;
    }>,
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
    products?: Array<{
      productName: string;
      brand: string;
      quantity: number;
      unit?: string;
    }>,
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
                "https://supplier.jaclit.com"
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
      "https://supplier.jaclit.com"
    }/returns`;

    return { subject, htmlBody, textBody };
  }
}
