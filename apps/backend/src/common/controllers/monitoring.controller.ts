import { Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { MonitoringService } from "../services/monitoring.service";
import { TelegramNotificationService } from "../services/telegram-notification.service";

@ApiTags("monitoring")
@Controller("monitoring")
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly telegramService: TelegramNotificationService
  ) {}

  @Get("health")
  @ApiOperation({ summary: "Check system health" })
  async checkHealth() {
    const dbHealthy = await this.monitoringService.checkDatabaseConnection();
    return {
      status: dbHealthy ? "healthy" : "unhealthy",
      database: dbHealthy ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    };
  }

  @Post("test-notification")
  @ApiOperation({ summary: "Send test Telegram notification" })
  async testNotification() {
    const sent = await this.monitoringService.sendTestNotification();
    return {
      success: sent,
      message: sent
        ? "Test notification sent successfully"
        : "Failed to send test notification (check logs and configuration)",
    };
  }

  @Post("health-check")
  @ApiOperation({ summary: "Trigger manual health check" })
  async triggerHealthCheck() {
    await this.monitoringService.performHealthCheck();
    return {
      success: true,
      message: "Health check completed",
    };
  }

  @Get("database-size")
  @ApiOperation({ summary: "Check current database storage size" })
  async checkDatabaseSize() {
    const info = await this.monitoringService.getDatabaseSizeInfo();
    return {
      success: true,
      ...info,
      message: `Database size: ${info.sizePretty} (${info.usagePercentage}% of ${info.planLimitGB} GB limit)`,
    };
  }
}

