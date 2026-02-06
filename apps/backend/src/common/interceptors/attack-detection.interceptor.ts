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
import { Counter, Gauge, register } from 'prom-client';
import { AttackDetectionService, AttackType } from '../services/attack-detection.service';

// Prometheus metrics for attack detection
const attackTotal = new Counter({
  name: 'cyber_attacks_total',
  help: 'Total number of detected cyber attacks',
  labelNames: ['attack_type', 'severity', 'ip'],
  registers: [register],
});

const attackRate = new Gauge({
  name: 'cyber_attack_rate_per_minute',
  help: 'Current attack rate per minute',
  labelNames: ['attack_type'],
  registers: [register],
});

const activeAttacks = new Gauge({
  name: 'active_cyber_attacks',
  help: 'Number of active attacks in the last 5 minutes',
  labelNames: ['attack_type', 'severity'],
  registers: [register],
});

const suspiciousIPs = new Gauge({
  name: 'suspicious_ips_count',
  help: 'Number of suspicious IP addresses',
  labelNames: ['attack_type'],
  registers: [register],
});

@Injectable()
export class AttackDetectionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AttackDetectionInterceptor.name);
  private readonly attackWindow = 5 * 60 * 1000; // 5 minutes
  private readonly recentAttacks = new Map<string, { timestamp: number; type: AttackType; severity: string }[]>();

  constructor(private readonly attackDetectionService: AttackDetectionService) {
    // Cleanup old attacks periodically
    setInterval(() => this.cleanupRecentAttacks(), 60000); // Every minute
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, route, url, body, headers, ip } = request;
    const routePath = route?.path || url?.split('?')[0] || 'unknown';
    const clientIp = ip || headers['x-forwarded-for'] || 'unknown';
    const userAgent = headers['user-agent'];

    // Check if this is a login endpoint
    const isLoginEndpoint = 
      routePath.includes('/login') || 
      routePath.includes('/iam/members/login');

    // Track request for DDoS detection
    const ddosResult = this.attackDetectionService.detectDDoS(clientIp);
    if (ddosResult.isAttack) {
      this.logAttack(ddosResult, clientIp, routePath, method);
    }

    // Detect other attack patterns
    const attackResults = this.attackDetectionService.detectAttack(
      clientIp,
      routePath,
      method,
      body || {},
      userAgent,
      200, // Will be updated after response
      false // Will be updated if login fails
    );

    // Log detected attacks
    attackResults.forEach(result => {
      if (result.isAttack) {
        this.logAttack(result, clientIp, routePath, method);
      }
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          // Update metrics after successful response
          this.updateMetrics(attackResults, clientIp, response.statusCode);
        },
      }),
      catchError((err) => {
        const statusCode = err instanceof HttpException ? err.getStatus() : 500;
        
        // Check for failed login
        const isFailedLogin = isLoginEndpoint && method === 'POST' && (statusCode === 401 || statusCode === 403);
        
        // Re-detect attacks with actual status code and failed login flag
        const finalAttackResults = this.attackDetectionService.detectAttack(
          clientIp,
          routePath,
          method,
          body || {},
          userAgent,
          statusCode,
          isFailedLogin
        );

        // Log all detected attacks
        finalAttackResults.forEach(result => {
          if (result.isAttack) {
            this.logAttack(result, clientIp, routePath, method);
          }
        });

        // Update metrics
        this.updateMetrics(finalAttackResults, clientIp, statusCode);

        throw err;
      })
    );
  }

  private logAttack(
    result: { isAttack: boolean; attackType: AttackType | null; severity: string; details: string; confidence: number },
    ip: string,
    routePath: string,
    method: string
  ): void {
    if (!result.isAttack || !result.attackType) return;

    const logMessage = `🚨 [CYBER ATTACK] ${result.attackType.toUpperCase()} detected from ${ip} on ${method} ${routePath} - Severity: ${result.severity} - Confidence: ${result.confidence}% - ${result.details}`;
    
    // Log based on severity
    switch (result.severity) {
      case 'critical':
        this.logger.error(logMessage);
        break;
      case 'high':
        this.logger.warn(logMessage);
        break;
      case 'medium':
        this.logger.warn(logMessage);
        break;
      default:
        this.logger.log(logMessage);
    }

    // Track recent attacks
    const key = `${ip}_${result.attackType}`;
    if (!this.recentAttacks.has(key)) {
      this.recentAttacks.set(key, []);
    }
    this.recentAttacks.get(key)!.push({
      timestamp: Date.now(),
      type: result.attackType,
      severity: result.severity,
    });
  }

  private updateMetrics(
    results: Array<{ isAttack: boolean; attackType: AttackType | null; severity: string }>,
    ip: string,
    statusCode: number
  ): void {
    results.forEach(result => {
      if (result.isAttack && result.attackType) {
        // Increment attack counter
        attackTotal.inc({
          attack_type: result.attackType,
          severity: result.severity,
          ip: ip.substring(0, 50), // Limit IP length
        });

        // Update active attacks gauge
        const key = `${ip}_${result.attackType}`;
        const recent = this.recentAttacks.get(key) || [];
        const active = recent.filter(a => Date.now() - a.timestamp < this.attackWindow);
        activeAttacks.set(
          { attack_type: result.attackType, severity: result.severity },
          active.length
        );
      }
    });

    // Update suspicious IPs count
    const uniqueIPs = new Set<string>();
    for (const [key] of this.recentAttacks.entries()) {
      const ip = key.split('_')[0];
      uniqueIPs.add(ip);
    }
    results.forEach(result => {
      if (result.isAttack && result.attackType) {
        suspiciousIPs.set({ attack_type: result.attackType }, uniqueIPs.size);
      }
    });
  }

  private cleanupRecentAttacks(): void {
    const now = Date.now();
    for (const [key, attacks] of this.recentAttacks.entries()) {
      const filtered = attacks.filter(a => now - a.timestamp < this.attackWindow);
      if (filtered.length === 0) {
        this.recentAttacks.delete(key);
      } else {
        this.recentAttacks.set(key, filtered);
      }
    }
  }
}

