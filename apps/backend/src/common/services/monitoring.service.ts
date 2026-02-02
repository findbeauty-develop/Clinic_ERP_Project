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
  
  // Database size monitoring thresholds
  private readonly planLimitGB: number;
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;
  private lastSizeCheck: Date | null = null;
  private lastWarningSent: Date | null = null;
  private lastCriticalSent: Date | null = null;
  private readonly sizeCheckCooldown = 60 * 60 * 1000; // 1 hour cooldown between alerts

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramNotificationService,
    private readonly configService: ConfigService
  ) {
    // Supabase storage monitoring configuration
    const planLimitGBConfig = this.configService.get<string | number>("SUPABASE_PLAN_LIMIT_GB");
    this.planLimitGB = planLimitGBConfig ? Number(planLimitGBConfig) : 8; // Default: 8GB for Pro plan
    
    const warningThresholdConfig = this.configService.get<string | number>("DB_SIZE_WARNING_THRESHOLD");
    this.warningThreshold = warningThresholdConfig ? Number(warningThresholdConfig) : 0.8; // 80%
    
    const criticalThresholdConfig = this.configService.get<string | number>("DB_SIZE_CRITICAL_THRESHOLD");
    this.criticalThreshold = criticalThresholdConfig ? Number(criticalThresholdConfig) : 0.9; // 90%
  }

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

      // 2. Database size check (Supabase storage monitoring)
      await this.checkDatabaseSize();

      // 3. External API health check (payment, etc.)
      await this.checkExternalAPIs();

      this.logger.debug("Health check completed successfully");
    } catch (error: any) {
      this.logger.error(`Health check failed: ${error.message}`);
    }
  }

 private async checkDatabase(): Promise<void> {
  // ✅ Policy check qo'shish
  const shouldNotify = 
    process.env.NODE_ENV === "production" && 
    process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true";
  
  if (!shouldNotify) {
    return; // Development'da yubormaslik
  }

  try {
    const startTime = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const duration = Date.now() - startTime;

    this.dbErrorCount = 0;
    this.lastDbCheck = new Date();
    this.logger.debug(`✅ Database check successful (${duration}ms)`);

    // ✅ Threshold'ni 3s ga o'zgartirish (1s juda past)
    if (duration > 3000) {
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
    // ✅ Policy check qo'shish
    const shouldNotify = 
      process.env.NODE_ENV === "production" && 
      process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true";
    
    if (!shouldNotify) {
      return; // Development'da yubormaslik
    }

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

  /**
   * Get database storage size information (public method for API endpoints)
   * Works in both development and production
   */
  async getDatabaseSizeInfo(): Promise<{
    sizeBytes: number;
    sizeMB: number;
    sizeGB: number;
    sizePretty: string;
    usagePercentage: number;
    planLimitGB: number;
    topTables: Array<{ table_name: string; size_pretty: string; size_mb: number }>;
    status: 'ok' | 'warning' | 'critical';
  }> {
    try {
      // Get current database size in bytes
      const sizeResult = await this.prisma.$queryRaw<Array<{ size: bigint }>>`
        SELECT pg_database_size(current_database()) as size
      `;
      
      const sizeInBytes = Number(sizeResult[0]?.size || 0);
      const sizeInMB = sizeInBytes / (1024 * 1024);
      const sizeInGB = sizeInMB / 1024;
      const usagePercentage = (sizeInGB / this.planLimitGB) * 100;

      // Get top 5 largest tables
      // Using c.oid instead of string concatenation to properly handle quoted identifiers
      const tableSizes = await this.prisma.$queryRaw<Array<{
        table_name: string;
        size_bytes: bigint;
        size_pretty: string;
      }>>`
        SELECT 
          nspname || '.' || relname AS table_name,
          pg_size_pretty(pg_total_relation_size(c.oid)) AS size_pretty,
          pg_total_relation_size(c.oid) AS size_bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE nspname = 'public' 
          AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 5
      `;

      // Determine status
      let status: 'ok' | 'warning' | 'critical' = 'ok';
      if (sizeInGB >= (this.planLimitGB * this.criticalThreshold)) {
        status = 'critical';
      } else if (sizeInGB >= (this.planLimitGB * this.warningThreshold)) {
        status = 'warning';
      }

      // Also trigger notification if in production
      const shouldNotify = 
        process.env.NODE_ENV === "production" && 
        process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true";
      
      if (shouldNotify) {
        // Trigger notification check (but don't wait for it)
        this.checkDatabaseSize().catch((error) => {
          this.logger.error(`Failed to send database size notification: ${error.message}`);
        });
      }

      return {
        sizeBytes: sizeInBytes,
        sizeMB: parseFloat(sizeInMB.toFixed(2)),
        sizeGB: parseFloat(sizeInGB.toFixed(2)),
        sizePretty: `${sizeInGB.toFixed(2)} GB`,
        usagePercentage: parseFloat(usagePercentage.toFixed(1)),
        planLimitGB: this.planLimitGB,
        topTables: tableSizes.map(t => {
          const sizeBytes = Number(t.size_bytes);
          const sizeMB = sizeBytes / (1024 * 1024);
          return {
            table_name: t.table_name,
            size_pretty: t.size_pretty,
            size_mb: parseFloat(sizeMB.toFixed(2)),
          };
        }),
        status: status,
      };
    } catch (error: any) {
      this.logger.error(`Database size check failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check database storage size and send alerts if thresholds are exceeded
   * Private method - only sends notifications in production
   */
  private async checkDatabaseSize(): Promise<void> {
    const shouldNotify = 
      process.env.NODE_ENV === "production" && 
      process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true";
    
    if (!shouldNotify) {
      return;
    }

    try {
      // Get current database size in bytes
      const sizeResult = await this.prisma.$queryRaw<Array<{ size: bigint }>>`
        SELECT pg_database_size(current_database()) as size
      `;
      
      const sizeInBytes = Number(sizeResult[0]?.size || 0);
      const sizeInMB = sizeInBytes / (1024 * 1024);
      const sizeInGB = sizeInMB / 1024;
      const usagePercentage = (sizeInGB / this.planLimitGB) * 100;

      this.lastSizeCheck = new Date();

      // Get top 5 largest tables for cleanup recommendations
      // Using pg_class with c.oid instead of string concatenation to properly handle quoted identifiers (PascalCase table names)
      const tableSizes = await this.prisma.$queryRaw<Array<{
        table_name: string;
        size_mb: number;
        size_pretty: string;
      }>>`
        SELECT 
          nspname || '.' || relname AS table_name,
          pg_size_pretty(pg_total_relation_size(c.oid)) AS size_pretty,
          pg_total_relation_size(c.oid)::bigint / (1024 * 1024) AS size_mb
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE nspname = 'public' 
          AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 5
      `;

      const topTables = tableSizes.map((t, index) => 
        `${index + 1}. ${t.table_name}: ${t.size_pretty}`
      ).join('\n');

      // Check thresholds with cooldown to prevent spam
      const now = new Date();
      const shouldSendWarning = 
        sizeInGB >= (this.planLimitGB * this.warningThreshold) &&
        (!this.lastWarningSent || (now.getTime() - this.lastWarningSent.getTime()) > this.sizeCheckCooldown);

      const shouldSendCritical = 
        sizeInGB >= (this.planLimitGB * this.criticalThreshold) &&
        (!this.lastCriticalSent || (now.getTime() - this.lastCriticalSent.getTime()) > this.sizeCheckCooldown);

      if (shouldSendCritical) {
        const message = `🚨 <b>CRITICAL: Database Storage Limit Approaching!</b>\n\n` +
          `📊 <b>Current Size:</b> ${sizeInGB.toFixed(2)} GB / ${this.planLimitGB} GB (${usagePercentage.toFixed(1)}%)\n\n` +
          `⚠️ <b>Action Required:</b> Upgrade plan or perform data cleanup immediately!\n\n` +
          `📋 <b>Top 5 Largest Tables:</b>\n${topTables}\n\n` +
          `💡 <b>Recommendations:</b>\n` +
          `• Archive old orders/transactions\n` +
          `• Clean up soft-deleted records\n` +
          `• Remove expired sessions\n` +
          `• Consider upgrading Supabase plan`;

        await this.telegram.sendDatabaseAlert(message);
        this.lastCriticalSent = now;
        this.logger.error(`🚨 Database storage CRITICAL: ${sizeInGB.toFixed(2)}GB (${usagePercentage.toFixed(1)}%)`);
      } else if (shouldSendWarning) {
        const message = `⚠️ <b>WARNING: Database Storage Growing</b>\n\n` +
          `📊 <b>Current Size:</b> ${sizeInGB.toFixed(2)} GB / ${this.planLimitGB} GB (${usagePercentage.toFixed(1)}%)\n\n` +
          `💡 <b>Monitoring:</b> Consider planning upgrade or cleanup before reaching limit\n\n` +
          `📋 <b>Top 5 Largest Tables:</b>\n${topTables}\n\n` +
          `💡 <b>Recommendations:</b>\n` +
          `• Review and archive old data\n` +
          `• Clean up unused records\n` +
          `• Monitor growth trends`;

        await this.telegram.sendDatabaseAlert(message);
        this.lastWarningSent = now;
        this.logger.warn(`⚠️ Database storage WARNING: ${sizeInGB.toFixed(2)}GB (${usagePercentage.toFixed(1)}%)`);
      } else {
        this.logger.debug(`✅ Database storage OK: ${sizeInGB.toFixed(2)}GB (${usagePercentage.toFixed(1)}%)`);
      }

    } catch (error: any) {
      this.logger.error(`Database size check failed: ${error.message}`);
      // Don't send alert for monitoring failures (to avoid spam)
    }
  }
}

