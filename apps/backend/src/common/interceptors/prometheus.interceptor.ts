import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Counter, Histogram } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
});

@Injectable()
export class PrometheusInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, route, url } = request;
    
    // Route path'ni to'g'ri olish
    let routePath = 'unknown';
    if (route?.path) {
      routePath = route.path;
    } else if (url) {
      // URL'dan path'ni olish (query string'siz)
      routePath = url.split('?')[0];
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (Date.now() - startTime) / 1000;
          httpRequestDuration.observe({ method, route: routePath }, duration);
          httpRequestsTotal.inc({
            method,
            route: routePath,
            status: response.statusCode,
          });
        },
        error: () => {
          const duration = (Date.now() - startTime) / 1000;
          httpRequestDuration.observe({ method, route: routePath }, duration);
          httpRequestsTotal.inc({
            method,
            route: routePath,
            status: response.statusCode || 500,
          });
        },
      })
    );
  }
}

