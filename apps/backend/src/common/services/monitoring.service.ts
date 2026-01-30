import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../core/prisma.service";
import { TelegramNotificationService } from "./telegram-notification.service";

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastDbCheck: Date | null = null;
  private dbErrorCount = 0;
  private readonly maxDbErrors = 3;
  private readonly healthCheckIntervalMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramNotificationService,
    private readonly configService: ConfigService
  ) {}

  onModuleInit() {
  const isProduction = process.env.NODE_ENV === "production";
  const intervalMs = isProduction 
    ? this.healthCheckIntervalMs  // 5 minut production'da
    : 1 * 60 * 1000; // 1 minut development'da (test uchun)

  this.logger.log("Starting health check monitoring...");
  
  this.healthCheckInterval = setInterval(() => {
    this.performHealthCheck().catch((error) => {
      this.logger.error(`Health check error: ${error.message}`);
    });
  }, intervalMs);

  // Dastlabki health check (30 sekunddan keyin)
  setTimeout(() => {
    this.performHealthCheck().catch((error) => {
      this.logger.error(`Initial health check error: ${error.message}`);
    });
  }, 30000);
}

  onModuleDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.logger.log("Health check monitoring stopped");
    }
  }

  async performHealthCheck(): Promise<void> {
    try {
      // 1. Database health check
      await this.checkDatabase();

      // 2. External API health check (payment, etc.)
      await this.checkExternalAPIs();

      this.logger.debug("Health check completed successfully");
    } catch (error: any) {
      this.logger.error(`Health check failed: ${error.message}`);
    }
  }

 private async checkDatabase(): Promise<void> {
  try {
    const startTime = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const duration = Date.now() - startTime;

    this.dbErrorCount = 0;
    this.lastDbCheck = new Date();
    this.logger.debug(`✅ Database check successful (${duration}ms)`);

    if (duration > 1000) {
      await this.telegram.sendDatabaseAlert(
        `⚠️ Database response slow: ${duration}ms`
      );
      this.logger.warn(`Database response slow: ${duration}ms`);
    }
  } catch (error: any) {
    this.dbErrorCount++;
    this.lastDbCheck = new Date();

    // ✅ Error message'ni qisqartirish
    const errorMessage = error.message || "Unknown error";
    const shortErrorMessage = errorMessage.length > 200 
      ? errorMessage.substring(0, 200) + "..." 
      : errorMessage;

    this.logger.error(`❌ Database error: ${errorMessage}`);
    this.logger.error(`📊 Error count: ${this.dbErrorCount}/${this.maxDbErrors}`);

    // ✅ Qisqa message
    const message = `❌ Database connection failed!\n\nError: ${shortErrorMessage}\nAttempt: ${this.dbErrorCount}/${this.maxDbErrors}`;

    if (this.dbErrorCount >= this.maxDbErrors) {
      this.logger.error(`📤 Sending Telegram alert (count: ${this.dbErrorCount})...`);
      const sent = await this.telegram.sendDatabaseAlert(message);
      this.logger.error(
        `Database connection failed ${this.dbErrorCount} times. Telegram sent: ${sent}`
      );
    } else {
      this.logger.warn(
        `Database check failed (${this.dbErrorCount}/${this.maxDbErrors}) - waiting for more errors`
      );
    }
  }
}

  private async checkExternalAPIs(): Promise<void> {
    const apis = [
      {
        name: "Payment API",
        url: this.configService.get<string>("PAYMENT_API_URL"),
        apiKey: this.configService.get<string>("PAYMENT_API_KEY"),
      },
      // Boshqa external API'lar qo'shishingiz mumkin
    ];

    for (const api of apis) {
      if (!api.url) continue;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(`${api.url}/health`, {
          method: "GET",
          headers: api.apiKey ? { "X-API-Key": api.apiKey } : {},
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          await this.telegram.sendHealthCheckAlert(
            api.name,
            `Unhealthy`,
            `HTTP ${response.status}`
          );
          this.logger.warn(`${api.name} health check failed: ${response.status}`);
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          await this.telegram.sendHealthCheckAlert(
            api.name,
            `Timeout`,
            "Request timeout after 5 seconds"
          );
        } else {
          await this.telegram.sendHealthCheckAlert(
            api.name,
            `Failed`,
            error.message
          );
        }
        this.logger.error(`${api.name} health check error: ${error.message}`);
      }
    }
  }

  async checkDatabaseConnection(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error: any) {
      this.logger.error(`Database connection check failed: ${error.message}`);
      return false;
    }
  }

  async sendTestNotification(): Promise<boolean> {
    return await this.telegram.sendSystemAlert(
      "Test Notification",
      "This is a test message from Clinic ERP Monitoring System"
    );
  }
}

