import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class TelegramNotificationService {
  private readonly logger = new Logger(TelegramNotificationService.name);
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.botToken =
      this.configService.get<string>("TELEGRAM_BOT_TOKEN") || "";
    this.chatId = this.configService.get<string>("TELEGRAM_CHAT_ID") || "";
    
    // ✅ Faqat production'da va flag bo'lsa enabled
    const isProduction = process.env.NODE_ENV === "production";
    const flagEnabled = process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true";
    
    this.enabled = isProduction && flagEnabled && !!this.botToken && !!this.chatId;

    if (this.enabled) {
      this.logger.log(`✅ Telegram notifications enabled (PRODUCTION)`);
    } else {
      if (!isProduction) {
        this.logger.debug("Telegram notifications disabled (NODE_ENV !== production)");
      } else if (!flagEnabled) {
        this.logger.debug("Telegram notifications disabled (ENABLE_TELEGRAM_NOTIFICATIONS !== true)");
      } else {
        this.logger.debug(
          "Telegram notifications disabled (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)"
        );
      }
    }
  }

  async sendMessage(message: string): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug("Telegram notifications disabled, skipping message");
      return false;
    }

    // ✅ Qo'shimcha production check (double check)
    if (process.env.NODE_ENV !== "production") {
      this.logger.debug("Skipping Telegram notification (not in production)");
      return false;
    }

    const MAX_LENGTH = 4000; // 4096 dan biroz kamroq (HTML tag'lar uchun)
    let finalMessage = message;
  
  if (message.length > MAX_LENGTH) {
    finalMessage = message.substring(0, MAX_LENGTH - 50) + "\n\n... (message truncated)";
    this.logger.warn(`Message truncated from ${message.length} to ${finalMessage.length} characters`);
  }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: "HTML",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        this.logger.error(`Telegram API error: ${errorText}`);
        return false;
      }

      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to send Telegram message: ${error.message}`,
        error.stack
      );
      return false;
    }
  }

  async sendErrorAlert(
    error: Error,
    context?: {
      url?: string;
      method?: string;
      userId?: string;
      tenantId?: string;
    }
  ): Promise<void> {
    const message = this.formatErrorAlert(error, context);
    await this.sendMessage(message);
  }

  async sendDatabaseAlert(message: string): Promise<boolean> {
  const formatted = `🚨 <b>Database Alert</b>\n\n${message}`;
  return await this.sendMessage(formatted);
}

  async sendHealthCheckAlert(
    service: string,
    status: string,
    details?: string
  ): Promise<void> {
    const emoji = status === "healthy" ? "✅" : "❌";
    let message = `${emoji} <b>Health Check</b>\n\n`;
    message += `Service: <b>${service}</b>\n`;
    message += `Status: <b>${status}</b>\n`;
    if (details) {
      message += `Details: ${details}`;
    }
    await this.sendMessage(message);
  }

  async sendSystemAlert(title: string, message: string): Promise<boolean> {
    const formatted = `⚠️ <b>${title}</b>\n\n${message}`;
    return await this.sendMessage(formatted);
  }

  private formatErrorAlert(
    error: Error,
    context?: {
      url?: string;
      method?: string;
      userId?: string;
      tenantId?: string;
    }
  ): string {
    const timestamp = new Date().toISOString();
    let message = `🚨 <b>Production Error Alert</b>\n\n`;
    message += `⏰ <b>Time:</b> ${timestamp}\n`;
    message += `❌ <b>Error:</b> ${this.escapeHtml(error.message)}\n`;

    if (context?.url) {
      message += `🔗 <b>URL:</b> ${context.method || "GET"} ${this.escapeHtml(
        context.url
      )}\n`;
    }

    if (context?.userId) {
      message += `👤 <b>User ID:</b> ${this.escapeHtml(context.userId)}\n`;
    }

    if (context?.tenantId) {
      message += `🏢 <b>Tenant ID:</b> ${this.escapeHtml(context.tenantId)}\n`;
    }

    if (error.stack) {
      const stackPreview = error.stack
        .split("\n")
        .slice(0, 5)
        .join("\n");
      message += `\n📋 <b>Stack:</b>\n<code>${this.escapeHtml(
        stackPreview
      )}</code>`;
    }

    return message;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

