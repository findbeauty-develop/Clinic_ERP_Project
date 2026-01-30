import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class PerformanceLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("PerformanceLogger");
  private readonly SLOW_REQUEST_THRESHOLD = 1000; // 1 second

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl } = req;

    // Track response finish
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;

      // Log slow requests
      if (duration > this.SLOW_REQUEST_THRESHOLD) {
        this.logger.warn(
          `Slow Request: ${method} ${originalUrl} - ${duration}ms - Status: ${statusCode}`
        );
      }

      // Log all requests in development
      if (process.env.NODE_ENV === "development" && duration > 500) {
      }
    });

    next();
  }
}
