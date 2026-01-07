import { Module } from "@nestjs/common";
import { MonitoringService } from "./services/monitoring.service";
import { MonitoringMiddleware } from "./middleware/monitoring.middleware";
import { MonitoringController } from "./controllers/monitoring.controller";
import { PrismaModule } from "../core/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
  exports: [MonitoringService],
})
export class MonitoringModule {}
