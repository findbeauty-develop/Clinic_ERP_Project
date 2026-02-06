import { Injectable, NestMiddleware, Logger } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class PerformanceLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("PerformanceLogger");
  private readonly SLOW_REQUEST_THRESHOLD = 1000; // 1 second

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl, ip } = req;
    const clientIp = ip || req.headers['x-forwarded-for'] || 'unknown';

    // ✅ Store original URL in request for attack detection (before NestJS normalization)
    // This is critical for path traversal detection
    (req as any).__originalUrl = originalUrl || req.url;

    // ✅ Login request'lar uchun maxsus logging (double request'ni aniqlash uchun)
    const isLoginEndpoint = originalUrl.includes('/iam/members/login') && method === 'POST';
    if (isLoginEndpoint) {
      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      (req as any).__loginRequestId = requestId; // Request ID'ni saqlash
      this.logger.log(
        `[LOGIN REQUEST] ${requestId} - ${method} ${originalUrl} from IP: ${clientIp} - User-Agent: ${req.headers['user-agent']?.substring(0, 50)}`
      );
    }

    // Track response finish
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;

      // ✅ Login response uchun maxsus logging
      if (isLoginEndpoint) {
        const requestId = (req as any).__loginRequestId || 'unknown';
        const status = statusCode === 200 ? '✅ SUCCESS' : `❌ FAILED (${statusCode})`;
        this.logger.log(
          `[LOGIN RESPONSE] ${requestId} - ${status} - Duration: ${duration}ms`
        );
      }

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
