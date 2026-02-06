import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { TelegramNotificationService } from "../services/telegram-notification.service";
import { ConfigService } from "@nestjs/config";
import { AttackDetectionService, AttackType } from "../services/attack-detection.service";
import { attackTotal } from '../metrics/attack-metrics';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private telegramService: TelegramNotificationService | null = null;
  private attackDetectionService: AttackDetectionService | null = null;

  private getTelegramService(): TelegramNotificationService | null {
    // Lazy initialization to avoid circular dependencies
    if (!this.telegramService) {
      try {
        const configService = new ConfigService();
        this.telegramService = new TelegramNotificationService(configService);
      } catch (error) {
        this.logger.warn("Failed to initialize Telegram service");
        return null;
      }
    }
    return this.telegramService;
  }

  private getAttackDetectionService(): AttackDetectionService | null {
    // Lazy initialization to avoid circular dependencies
    if (!this.attackDetectionService) {
      try {
        const configService = new ConfigService();
        this.attackDetectionService = new AttackDetectionService(configService);
      } catch (error) {
        this.logger.warn("Failed to initialize Attack Detection service");
        return null;
      }
    }
    return this.attackDetectionService;
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // ✅ Status code va message olish
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : "Internal server error";

    // ✅ Production environment tekshirish
    const isProduction = process.env.NODE_ENV === "production";

    // ✅ Error message'ni format qilish
    const errorMessage =
      typeof message === "string"
        ? message
        : (message as any)?.message || "Internal server error";

    // ✅ Stack trace olish (faqat development'da)
    const stack = exception instanceof Error ? exception.stack : undefined;

    // ✅ Sensitive data'ni filter qilish (password, token, secret key'lar)
    const sanitizedRequest = this.sanitizeRequest(request);

    // ✅ Error response yaratish
    const errorResponse: any = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: errorMessage,
    };

    // ✅ Production'da stack trace yashirish, development'da ko'rsatish
    if (!isProduction && stack) {
      errorResponse.stack = stack;
    }

    // ✅ Error'ni log qilish (production'da ham stack trace bilan)
    // 404 error'lar uchun warning, boshqa error'lar uchun error
    const logContext = {
      stack: stack,
      body: sanitizedRequest.body,
      query: sanitizedRequest.query,
      params: sanitizedRequest.params,
      headers: this.sanitizeHeaders(request.headers),
    };

    // ✅ Attack detection (404 va boshqa error'lar uchun ham)
    const attackService = this.getAttackDetectionService();
    if (attackService) {
      try {
        const originalUrl = (request as any).__originalUrl || request.url;
        const fullUrl = originalUrl;
        const requestData = {
          ...(request.body || {}),
          ...(request.query || {}),
        };
        // ✅ Ensure clientIp is always a string
        const forwardedFor = request.headers['x-forwarded-for'];
        const clientIp = request.ip || 
                        (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || 
                        'unknown';
        const userAgent = typeof request.headers['user-agent'] === 'string' 
                         ? request.headers['user-agent'] 
                         : undefined;

        const attackResults = attackService.detectAttack(
          clientIp,
          fullUrl,
          request.method,
          requestData,
          userAgent,
          status,
          false
        );

        // Log detected attacks and update metrics
        attackResults.forEach(result => {
          if (result.isAttack && result.attackType) {
            this.logger.warn(
              `🚨 [CYBER ATTACK] ${result.attackType.toUpperCase()} detected from ${clientIp} on ${request.method} ${request.url} - Severity: ${result.severity} - ${result.details}`
            );
            
            // ✅ Update Prometheus metrics
            attackTotal.inc({
              attack_type: result.attackType,
              severity: result.severity,
              ip: clientIp.substring(0, 50), // Limit IP length
            });
          }
        });
      } catch (error) {
        this.logger.warn(`Failed to detect attacks in exception filter: ${error}`);
      }
    }

    if (status === HttpStatus.NOT_FOUND) {
      // ✅ Static file'lar (image, CSS, JS) uchun 404 log qilmaslik
      const isStaticFile =
        request.url.startsWith("/uploads/") ||
        request.url.match(
          /\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot)$/i
        );

      if (!isStaticFile) {
        // ✅ Faqat API endpoint'lar uchun 404 log qilish
        this.logger.warn(
          `${request.method} ${request.url} - 404 - ${errorMessage}`,
          logContext
        );
      }
      // ✅ Static file'lar uchun log qilmaslik (ko'p log yaratmaslik uchun)
    } else if (status >= 500) {
      // ✅ Server error'lar uchun error level
      this.logger.error(
        `${request.method} ${request.url} - ${status} - ${errorMessage}`,
        logContext
      );

      // ✅ Production'da critical error'lar uchun Telegram notification
      if (
        isProduction &&
        process.env.ENABLE_TELEGRAM_NOTIFICATIONS === "true"
      ) {
        // Faqat critical error'lar uchun (spam oldini olish)
        const shouldNotify =
          status >= 500 &&
          !errorMessage.includes("favicon") &&
          !errorMessage.includes("static") &&
          !request.url.match(/\.(jpg|jpeg|png|gif|svg|webp|ico|css|js)$/i);

        if (shouldNotify) {
          const telegramService = this.getTelegramService();
          if (telegramService) {
            telegramService
              .sendErrorAlert(exception as Error, {
                url: request.url,
                method: request.method,
                userId: (request as any).user?.id,
                tenantId: (request as any).tenantId,
              })
              .catch((err) => {
                this.logger.error(
                  `Failed to send Telegram alert: ${err.message}`
                );
              });
          }
        }
      }
    } else {
      // ✅ Client error'lar (400-499) uchun warn level
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${errorMessage}`,
        logContext
      );
    }

    // ✅ Response yuborish
    response.status(status).json(errorResponse);
  }

  /**
   * Request'dan sensitive data'ni olib tashlash
   */
  private sanitizeRequest(request: Request): any {
    const sanitized: any = {
      body: { ...request.body },
      query: { ...request.query },
      params: { ...request.params },
    };

    // ✅ Password field'larini yashirish
    const sensitiveFields = [
      "password",
      "password_hash",
      "token",
      "access_token",
      "refresh_token",
      "secret",
      "api_key",
      "apiKey",
      "secret_key",
      "secretKey",
      "authorization",
      "Authorization",
    ];

    // Body'dan sensitive field'larni olib tashlash
    if (sanitized.body) {
      sensitiveFields.forEach((field) => {
        if (sanitized.body[field]) {
          sanitized.body[field] = "[REDACTED]";
        }
      });
    }

    // Query'dan sensitive field'larni olib tashlash
    if (sanitized.query) {
      sensitiveFields.forEach((field) => {
        if (sanitized.query[field]) {
          sanitized.query[field] = "[REDACTED]";
        }
      });
    }

    return sanitized;
  }

  /**
   * Header'lardan sensitive data'ni olib tashlash
   */
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveHeaders = [
      "authorization",
      "Authorization",
      "cookie",
      "Cookie",
      "x-api-key",
      "X-API-Key",
    ];

    sensitiveHeaders.forEach((header) => {
      if (sanitized[header]) {
        sanitized[header] = "[REDACTED]";
      }
    });

    return sanitized;
  }
}
