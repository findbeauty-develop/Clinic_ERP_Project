import { Controller, Get } from "@nestjs/common";
import { MonitoringService } from "../services/monitoring.service";
import { PrismaService } from "../../core/prisma.service";

@Controller("monitoring")
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly prisma: PrismaService
  ) {}

  @Get("metrics")
  async getMetrics() {
    return await this.monitoringService.logAllMetrics(this.prisma);
  }

  @Get("system")
  getSystemMetrics() {
    return this.monitoringService.logSystemMetrics();
  }

  @Get("database")
  async getDatabaseMetrics() {
    return await this.monitoringService.getDatabaseMetrics(this.prisma);
  }
}
