import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class MonitoringMiddleware implements NestMiddleware {
  private readonly logger = new Logger("Monitoring");

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;

      // Sekin requestlarni log qilish
      if (duration > 1000) {
        this.logger.warn(
          `SLOW REQUEST: ${req.method} ${req.url} - ${duration}ms`
        );
      }

      // Memory leak detection
      const memUsage = process.memoryUsage();
      const memoryUsagePercent = memUsage.heapUsed / memUsage.heapTotal;
      if (memoryUsagePercent > 0.9) {
        this.logger.error(
          `HIGH MEMORY USAGE WARNING: ${(memoryUsagePercent * 100).toFixed(2)}%`
        );
      }
    });

    next();
  }
}
