import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

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

    if (status === HttpStatus.NOT_FOUND) {
      // ✅ Static file'lar (image, CSS, JS) uchun 404 log qilmaslik
      const isStaticFile =
        request.url.startsWith("/uploads/") ||
        request.url.match(/\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot)$/i);

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

