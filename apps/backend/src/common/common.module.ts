import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TelegramNotificationService } from "./services/telegram-notification.service";
import { MonitoringService } from "./services/monitoring.service";
import { PrismaModule } from "../core/prisma.module";
import { MonitoringController } from "./controllers/monitoring.controller";

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [MonitoringController],
  providers: [TelegramNotificationService, MonitoringService],
  exports: [TelegramNotificationService, MonitoringService],
})
export class CommonModule {}

