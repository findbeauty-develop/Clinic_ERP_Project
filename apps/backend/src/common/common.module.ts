import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TelegramNotificationService } from "./services/telegram-notification.service";
import { MonitoringService } from "./services/monitoring.service";
import { AttackDetectionService } from "./services/attack-detection.service";
import { SupabaseService } from "./supabase.service";
import { JwtTenantGuard } from "./guards/jwt-tenant.guard";
import { RolesGuard } from "./guards/roles.guard";
import { PrismaModule } from "../core/prisma.module";
import { MonitoringController } from "./controllers/monitoring.controller";
import { MetricsController } from "./controllers/metrics.controller";
import { AttackDetectionController } from "./controllers/attack-detection.controller";
import { CommonPrometheusModule } from "./prometheus.module";

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, CommonPrometheusModule],
  controllers: [
    MonitoringController,
    MetricsController,
    AttackDetectionController, // ✅ Attack detection controller
  ],
  providers: [
    TelegramNotificationService,
    MonitoringService,
    AttackDetectionService, // ✅ Attack detection service
    SupabaseService, // ✅ SupabaseService for JwtTenantGuard
    JwtTenantGuard, // ✅ JwtTenantGuard for AttackDetectionController
    RolesGuard, // ✅ RolesGuard for AttackDetectionController
  ],
  exports: [
    TelegramNotificationService,
    MonitoringService,
    AttackDetectionService, // ✅ Export for use in interceptors
    SupabaseService, // ✅ Export SupabaseService
    JwtTenantGuard, // ✅ Export JwtTenantGuard
    RolesGuard, // ✅ Export RolesGuard
  ],
})
export class CommonModule {}

