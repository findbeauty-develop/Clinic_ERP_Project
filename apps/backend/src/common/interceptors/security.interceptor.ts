import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Counter, register } from 'prom-client';

// Failed login attempts counter
const failedLoginAttempts = new Counter({
  name: 'failed_login_attempts_total',
  help: 'Total number of failed login attempts',
  labelNames: ['ip', 'endpoint'],
  registers: [register], // ✅ Prometheus registry'ga qo'shish
});

// Successful login counter
const successfulLogins = new Counter({
  name: 'successful_logins_total',
  help: 'Total number of successful logins',
  labelNames: ['endpoint'],
  registers: [register], // ✅ Prometheus registry'ga qo'shish
});

@Injectable()
export class SecurityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SecurityInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, route, ip } = request;
    const routePath = route?.path || 'unknown';
    const clientIp = ip || request.headers['x-forwarded-for'] || 'unknown';

    // Check if this is a login endpoint
    const isLoginEndpoint = 
      routePath.includes('/login') || 
      routePath.includes('/iam/members/login');

    // ✅ Debug logging (faqat development'da)
    if (isLoginEndpoint && method === 'POST' && process.env.NODE_ENV !== 'production') {
      this.logger.debug(`[SecurityInterceptor] Login attempt detected: ${method} ${routePath} from IP: ${clientIp}`);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          // ✅ Track successful logins - faqat success response bo'lganda
          if (isLoginEndpoint && method === 'POST') {
            successfulLogins.inc({ endpoint: routePath });
            if (process.env.NODE_ENV !== 'production') {
              this.logger.debug(`[SecurityInterceptor] ✅ Successful login tracked for endpoint: ${routePath}`);
            }
          }
        },
        // ❌ ERROR handler'ni olib tashladik - faqat catchError ishlaydi
      }),
      catchError((err) => {
        // ✅ Track failed login attempts - faqat 401/403 error bo'lganda
        if (isLoginEndpoint && method === 'POST') {
          if (err instanceof HttpException) {
            const status = err.getStatus();
            // Faqat authentication/authorization error'lar uchun
            if (status === 401 || status === 403) {
              failedLoginAttempts.inc({
                ip: clientIp,
                endpoint: routePath,
              });
              if (process.env.NODE_ENV !== 'production') {
                this.logger.warn(`[SecurityInterceptor] ❌ Failed login tracked: ${status} for endpoint: ${routePath} from IP: ${clientIp}`);
              }
            }
          }
        }
        throw err; // Error'ni qayta throw qilish
      })
    );
  }
}