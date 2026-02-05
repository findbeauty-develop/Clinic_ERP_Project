import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Counter } from 'prom-client';

// Failed login attempts counter
const failedLoginAttempts = new Counter({
  name: 'failed_login_attempts_total',
  help: 'Total number of failed login attempts',
  labelNames: ['ip', 'endpoint'],
});

// Successful login counter
const successfulLogins = new Counter({
  name: 'successful_logins_total',
  help: 'Total number of successful logins',
  labelNames: ['endpoint'],
});

@Injectable()
export class SecurityInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, route, ip } = request;
    const routePath = route?.path || 'unknown';
    const clientIp = ip || request.headers['x-forwarded-for'] || 'unknown';

    // Check if this is a login endpoint
    const isLoginEndpoint = 
      routePath.includes('/login') || 
      routePath.includes('/iam/members/login');

    return next.handle().pipe(
      tap({
        next: () => {
          // Track successful logins
          if (isLoginEndpoint && method === 'POST') {
            successfulLogins.inc({ endpoint: routePath });
          }
        },
        error: (err) => {
          // Track failed login attempts
          if (isLoginEndpoint && method === 'POST') {
            // Check if it's an authentication error (401 Unauthorized)
            if (err instanceof HttpException && err.getStatus() === 401) {
              failedLoginAttempts.inc({
                ip: clientIp,
                endpoint: routePath,
              });
            }
          }
        },
      }),
      catchError((err) => {
        // Track failed login attempts in catchError as well
        if (isLoginEndpoint && method === 'POST') {
          if (err instanceof HttpException && err.getStatus() === 401) {
            failedLoginAttempts.inc({
              ip: clientIp,
              endpoint: routePath,
            });
          }
        }
        throw err;
      })
    );
  }
}