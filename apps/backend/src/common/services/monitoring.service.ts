import * as os from "os";
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringService.name);
  private metricsInterval: NodeJS.Timeout | null = null;

  onModuleInit() {
    // Periodic metrics logging (every 5 minutes if enabled)
    const enablePeriodicLogging =
      process.env.ENABLE_PERIODIC_METRICS === "true";
    const intervalMinutes = parseInt(
      process.env.METRICS_LOG_INTERVAL_MINUTES || "5",
      10
    );

    if (enablePeriodicLogging) {
      this.logger.log(
        `Periodic metrics logging enabled (every ${intervalMinutes} minutes)`
      );
      this.metricsInterval = setInterval(() => {
        this.logSystemMetrics();
      }, intervalMinutes * 60 * 1000);
    }
  }

  onModuleDestroy() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
  }

  logSystemMetrics() {
    const metrics = {
      // CPU
      cpuUsage: process.cpuUsage(),
      loadAverage: os.loadavg(),

      // Memory
      totalMemory: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + " GB",
      freeMemory: (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + " GB",
      usedMemory:
        ((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(2) +
        " GB",
      memoryUsagePercent:
        (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2) +
        "%",

      // Process
      processMemory: process.memoryUsage(),
      uptime: (process.uptime() / 60).toFixed(2) + " minutes",
    };

    this.logger.log("System Metrics:", JSON.stringify(metrics, null, 2));
    return metrics;
  }

  async getDatabaseMetrics(prisma: any) {
    try {
      // Active connections
      const connections = await prisma.$queryRaw`
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE datname = current_database();
    `;

      // Sekin querylar
      const slowQueries = await prisma.$queryRaw`
      SELECT query, state, wait_event_type, 
             now() - query_start as duration
      FROM pg_stat_activity
      WHERE state = 'active' 
      AND now() - query_start > interval '2 seconds'
      ORDER BY duration DESC
      LIMIT 5;
    `;

      // BigInt'ni number'ga convert qilish
      const count = connections[0]?.count;
      const activeConnections =
        typeof count === "bigint" ? Number(count) : count || 0;

      // Slow queries'dagi duration ham BigInt bo'lishi mumkin
      const formattedSlowQueries = (slowQueries || []).map((query: any) => ({
        query: query.query,
        state: query.state,
        wait_event_type: query.wait_event_type,
        duration: query.duration ? String(query.duration) : null,
      }));

      return {
        activeConnections,
        slowQueries: formattedSlowQueries,
      };
    } catch (error) {
      this.logger.error("Database metrics error:", error);
      return null;
    }
  }

  /**
   * Log comprehensive system and database metrics
   */
  async logAllMetrics(prisma: any) {
    const systemMetrics = this.logSystemMetrics();
    const dbMetrics = await this.getDatabaseMetrics(prisma);

    return {
      system: systemMetrics,
      database: dbMetrics,
    };
  }
}
