import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { MonitoringService } from '../services/monitoring.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController extends PrometheusController {
  constructor(private readonly monitoringService: MonitoringService) {
    super();
  }

  @Get('cost-monitoring')
  @ApiOperation({ summary: 'Get cost monitoring metrics (database size, growth rate, projection)' })
  async getCostMonitoring() {
    const info = await this.monitoringService.getDatabaseSizeInfo();
    return {
      success: true,
      database: {
        currentSize: info.sizeGB,
        currentSizePretty: info.sizePretty,
        usagePercentage: info.usagePercentage,
        planLimitGB: info.planLimitGB,
        status: info.status,
      },
      growth: {
        growthRateGBPerDay: info.growthRateGBPerDay,
        daysUntilLimit: info.daysUntilLimit,
        projection: info.daysUntilLimit
          ? `Database will reach limit in approximately ${Math.round(info.daysUntilLimit)} days`
          : 'Growth rate is negative or zero, no limit concern',
      },
      topTables: info.topTables,
    };
  }
}

