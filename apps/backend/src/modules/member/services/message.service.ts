import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IMessageProvider } from "./message-provider.interface";

import { KakaoProvider } from "./providers/kakao.provider";
import { KTCommunisProvider } from "./providers/kt-communis.provider";
import { SolapiProvider } from "./providers/solapi.provider";

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);
  private provider: IMessageProvider;

  constructor(
    private configService: ConfigService,

    private solapiProvider: SolapiProvider
  ) {
    // Config'dan provider tanlash
    const providerName =
      this.configService.get<string>("MESSAGE_PROVIDER") || "solapi";
    this.provider = this.getProvider(providerName);
  }

  private getProvider(name: string): IMessageProvider {
    switch (name.toLowerCase()) {
      case "solapi":
        return this.solapiProvider;
      default:
        this.logger.warn(`Unknown provider: ${name}, using Solapi`);
        return this.solapiProvider;
    }
  }

  /**
   * Send SMS using the configured provider
   */
  async sendSMS(
    phoneNumber: string,
    message: string,
    isCritical: boolean = false
  ): Promise<boolean> {
    try {
      const smsSent = await this.provider.sendSMS(
        phoneNumber,
        message,
        isCritical
      );
      if (smsSent) {
      } else {
        this.logger.warn(`Failed to send SMS to ${phoneNumber}`);
      }
      return smsSent;
    } catch (error: any) {
      this.logger.error(
        `Error sending SMS: ${error?.message || "Unknown error"}`
      );
      return false;
    }
  }

  /**
   * Member credentials'ni SMS va KakaoTalk orqali yuborish
   */
  async sendMemberCredentials(
    phoneNumber: string,
    clinicName: string,
    members: Array<{
      memberId: string;
      role: string;
      temporaryPassword: string;
    }>
  ): Promise<{ smsSent: boolean; kakaoSent: boolean }> {
    const message = this.formatMemberCredentialsMessage(clinicName, members);

    // ✅ Member credentials - critical SMS
    const [smsSent, kakaoSent] = await Promise.all([
      this.provider.sendSMS(phoneNumber, message, true).catch(() => false), // isCritical = true
      this.provider.sendKakaoTalk(phoneNumber, message).catch(() => false),
    ]);

    return { smsSent, kakaoSent };
  }

  /**
   * Member credentials message format
   */
  private formatMemberCredentialsMessage(
    clinicName: string,
    members: Array<{
      memberId: string;
      role: string;
      temporaryPassword: string;
    }>
  ): string {
    let message = `[${clinicName}] 계정 정보\n\n`;

    members.forEach((member) => {
      const roleLabel =
        member.role === "owner"
          ? "원장"
          : member.role === "manager"
            ? "관리자"
            : "직원";

      message += `${roleLabel} ID: ${member.memberId}\n`;

      // Owner uchun "비밀번호", boshqalar uchun "임시 비밀번호"
      if (member.role === "owner") {
        message += `비밀번호: ${member.temporaryPassword}\n\n`;
      } else {
        message += `임시 비밀번호: ${member.temporaryPassword}\n\n`;
      }
    });

    const frontendUrl = this.configService.get<string>("FRONTEND_URL");
    if (!frontendUrl) {
      this.logger.warn(
        "FRONTEND_URL is not set in .env, using default localhost URL"
      );
    }
    const baseUrl = frontendUrl || "https://clinic.jaclit.com";
    // Trailing slash'ni olib tashlash
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    message += `로그인: ${cleanBaseUrl}/login\n\n`;

    // Owner uchun xabar o'zgartirish
    if (members.some((m) => m.role === "owner") && members.length === 1) {
      message += `※ 비밀번호를 안전하게 보관해주세요.`;
    } else {
      message += `※ 보안을 위해 첫 로그인 시 비밀번호를 변경해주세요.`;
    }

    return message;
  }

  /** 플랫폼 가입 공급업체 vs 비가입(수기) 공급업체 — 본문(주문번호·제품·금액 등)은 동일, 머리말/맺음말만 다름 */
  async sendOrderNotification(
    phoneNumber: string,
    clinicName: string,
    orderNo: string,
    totalAmount: number,
    itemCount: number,
    clinicManagerName?: string,
    products?: Array<{ productName: string; brand: string; quantity?: number }>,
    smsFormat: "platform" | "manual" = "platform"
  ): Promise<boolean> {
    if (!phoneNumber) {
      this.logger.warn("Phone number is required for order notification");
      return false;
    }

    const message =
      smsFormat === "manual"
        ? this.formatManualSupplierOrderNotificationMessage(
            clinicName,
            orderNo,
            totalAmount,
            itemCount,
            clinicManagerName,
            products
          )
        : this.formatOrderNotificationMessage(
            clinicName,
            orderNo,
            totalAmount,
            itemCount,
            clinicManagerName,
            products
          );

    try {
      // ✅ Order notifications - critical SMS (high-value orders)
      const isCritical = totalAmount > 1000000; // 1M won dan katta
      const smsSent = await this.provider.sendSMS(
        phoneNumber,
        message,
        isCritical
      );
      if (smsSent) {
      } else {
        this.logger.warn(
          `Failed to send order notification SMS to ${phoneNumber}`
        );
      }
      return smsSent;
    } catch (error: any) {
      this.logger.error(
        `Error sending order notification SMS: ${
          error?.message || "Unknown error"
        }`
      );
      return false;
    }
  }

  /** 주문번호·담당자·제품·금액·수량 — 플랫폼/수기 SMS 공통 본문 */
  private buildOrderNotificationDetailBlock(
    orderNo: string,
    totalAmount: number,
    itemCount: number,
    clinicManagerName?: string,
    products?: Array<{ productName: string; brand: string; quantity?: number }>,
    includeOrderNoLine = true
  ): string {
    let block = "";
    if (includeOrderNoLine) {
      block += `주문번호: ${orderNo}\n`;
    }

    if (clinicManagerName) {
      block += `담당자: ${clinicManagerName}\n`;
    }

    if (products && products.length > 0) {
      const productLines = products
        .map((p) => {
          const name = `${p.productName}${p.brand ? ` ${p.brand}` : ""}`;
          return p.quantity !== undefined
            ? `  - ${name} ${p.quantity} Box`
            : `  - ${name}`;
        })
        .join("\n");
      block += `제품명:\n${productLines}\n`;
    }

    block += `총 금액: ${totalAmount.toLocaleString("ko-KR")}원\n`;
    block += `제품 총 수량: ${itemCount} Box\n`;
    return block;
  }

  /**
   * 플랫폼 가입 공급업체용 주문 알림 SMS
   */
  private formatOrderNotificationMessage(
    clinicName: string,
    orderNo: string,
    totalAmount: number,
    itemCount: number,
    clinicManagerName?: string,
    products?: Array<{ productName: string; brand: string; quantity?: number }>
  ): string {
    let message = `[주문 알림]\n클리닉: ${clinicName}\n신규 주문이 접수되었습니다.\n\n`;
    message += this.buildOrderNotificationDetailBlock(
      orderNo,
      totalAmount,
      itemCount,
      clinicManagerName,
      products
    );
    message += `\n자세한 내용은 공급업체 플랫폼에서 확인하세요.\n\n`;

    const supplierFrontendUrl = this.configService.get<string>(
      "SUPPLIER_FRONTEND_URL"
    );
    if (!supplierFrontendUrl) {
      this.logger.warn(
        "SUPPLIER_FRONTEND_URL is not set in .env, using default localhost URL"
      );
    }
    const baseUrl = supplierFrontendUrl || "https://supplier.jaclit.com";
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    message += `${cleanBaseUrl}/orders`;

    return message;
  }

  /**
   * 플랫폼 미가입(수기) 공급업체용 — 주문번호로 바로 시작(별도 머리줄 없음, 플랫폼 URL 없음).
   */
  private formatManualSupplierOrderNotificationMessage(
    clinicName: string,
    orderNo: string,
    totalAmount: number,
    itemCount: number,
    clinicManagerName?: string,
    products?: Array<{ productName: string; brand: string; quantity?: number }>
  ): string {
    let message = `주문번호: ${orderNo}\n클리닉: ${clinicName}\n\n`;
    message += this.buildOrderNotificationDetailBlock(
      orderNo,
      totalAmount,
      itemCount,
      clinicManagerName,
      products,
      false
    );
    message += `\n자세한 내용은 공급업체 플랫폼에서 확인하세요.\n\n`;
    const supplierFrontendUrl = this.configService.get<string>(
      "SUPPLIER_FRONTEND_URL"
    );
    const baseUrl = supplierFrontendUrl || "https://supplier.jaclit.com";
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    message += `${cleanBaseUrl}/orders`;
    return message;
  }

  /**
   * 주문 취소 SMS (format — 주문 알림 bilan bir xil tuzilma, to'liq mahsulotlar)
   */
  async sendOrderCancellationNotification(
    phoneNumber: string,
    clinicName: string,
    orderNo: string,
    totalAmount: number,
    itemCount: number,
    cancelledAtLabel: string,
    clinicManagerName?: string,
    products?: Array<{ productName: string; brand: string; quantity?: number }>
  ): Promise<boolean> {
    if (!phoneNumber) {
      this.logger.warn("Phone number is required for cancellation SMS");
      return false;
    }

    const message = this.formatOrderCancellationMessage(
      clinicName,
      orderNo,
      totalAmount,
      itemCount,
      cancelledAtLabel,
      clinicManagerName,
      products
    );

    try {
      return await this.provider.sendSMS(phoneNumber, message, false);
    } catch (error: any) {
      this.logger.error(
        `Error sending cancellation SMS: ${error?.message || "Unknown error"}`
      );
      return false;
    }
  }

  private formatOrderCancellationMessage(
    clinicName: string,
    orderNo: string,
    totalAmount: number,
    itemCount: number,
    cancelledAtLabel: string,
    clinicManagerName?: string,
    products?: Array<{ productName: string; brand: string; quantity?: number }>
  ): string {
    let message = `[주문 취소]\n클리닉: ${clinicName}\n클리닉에서 아래 주문을 취소했습니다.\n\n`;
    message += `주문번호: ${orderNo}\n`;

    if (clinicManagerName) {
      message += `담당자: ${clinicManagerName}\n`;
    }

    if (products && products.length > 0) {
      const productLines = products
        .map((p) => {
          const name = `${p.productName}${p.brand ? ` ${p.brand}` : ""}`;
          return p.quantity !== undefined
            ? `  - ${name} ${p.quantity} Box`
            : `  - ${name}`;
        })
        .join("\n");
      message += `제품명:\n${productLines}\n`;
    }

    message += `총 금액: ${totalAmount.toLocaleString("ko-KR")}원\n`;
    message += `제품 총 수량: ${itemCount} Box\n`;
    message += `취소일시: ${cancelledAtLabel}\n\n`;
    message += `자세한 내용은 공급업체 플랫폼에서 확인하세요.\n\n`;

    const supplierFrontendUrl = this.configService.get<string>(
      "SUPPLIER_FRONTEND_URL"
    );
    const baseUrl = supplierFrontendUrl || "https://supplier.jaclit.com";
    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    message += `${cleanBaseUrl}/orders`;

    return message;
  }
}
