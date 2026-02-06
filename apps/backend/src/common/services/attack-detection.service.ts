import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum AttackType {
  BRUTE_FORCE = 'brute_force',
  DDOS = 'ddos',
  SQL_INJECTION = 'sql_injection',
  XSS = 'xss',
  PATH_TRAVERSAL = 'path_traversal',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  SUSPICIOUS_USER_AGENT = 'suspicious_user_agent',
  SUSPICIOUS_PAYLOAD = 'suspicious_payload',
}

export interface AttackDetectionResult {
  isAttack: boolean;
  attackType: AttackType | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
  confidence: number; // 0-100
}

@Injectable()
export class AttackDetectionService {
  private readonly logger = new Logger(AttackDetectionService.name);
  
  // IP-based attack tracking (in-memory, production'da Redis ishlatish tavsiya etiladi)
  private readonly ipAttackCounts = new Map<string, { count: number; firstSeen: number; lastSeen: number }>();
  private readonly ipFailedLogins = new Map<string, { count: number; firstSeen: number; lastSeen: number }>();
  
  // Configuration
  private readonly bruteForceThreshold: number;
  private readonly bruteForceWindow: number; // milliseconds
  private readonly ddosThreshold: number;
  private readonly ddosWindow: number; // milliseconds
  private readonly cleanupInterval: number; // milliseconds

  constructor(private readonly configService: ConfigService) {
    // Configuration from environment variables
    this.bruteForceThreshold = Number(this.configService.get('ATTACK_BRUTE_FORCE_THRESHOLD')) || 5; // 5 failed logins
    this.bruteForceWindow = Number(this.configService.get('ATTACK_BRUTE_FORCE_WINDOW')) || 15 * 60 * 1000; // 15 minutes
    this.ddosThreshold = Number(this.configService.get('ATTACK_DDOS_THRESHOLD')) || 100; // 100 requests
    this.ddosWindow = Number(this.configService.get('ATTACK_DDOS_WINDOW')) || 60 * 1000; // 1 minute
    this.cleanupInterval = Number(this.configService.get('ATTACK_CLEANUP_INTERVAL')) || 60 * 60 * 1000; // 1 hour

    // Cleanup old entries periodically
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  /**
   * Detect SQL injection patterns in request
   */
  detectSQLInjection(url: string, body: any): AttackDetectionResult {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/i,
      /('|(\\')|(;)|(--)|(\/\*)|(\*\/)|(\+)|(\%27)|(\%22))/i,
      /(\bOR\b.*=.*)|(\bAND\b.*=.*)/i,
      /(\bUNION\b.*\bSELECT\b)/i,
      /(\bEXEC\b|\bEXECUTE\b)/i,
      /(\bSCRIPT\b)/i,
    ];

    const searchString = JSON.stringify({ url, body }).toLowerCase();
    
    for (const pattern of sqlPatterns) {
      if (pattern.test(searchString)) {
        return {
          isAttack: true,
          attackType: AttackType.SQL_INJECTION,
          severity: 'high',
          details: `SQL injection pattern detected: ${pattern.toString()}`,
          confidence: 85,
        };
      }
    }

    return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
  }

  /**
   * Detect XSS (Cross-Site Scripting) patterns
   */
  detectXSS(url: string, body: any): AttackDetectionResult {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/i,
      /on\w+\s*=/i, // onclick=, onerror=, etc.
      /<img[^>]*src[^>]*=.*javascript:/i,
      /<svg[^>]*onload/i,
      /eval\s*\(/i,
      /expression\s*\(/i,
    ];

    const searchString = JSON.stringify({ url, body }).toLowerCase();
    
    for (const pattern of xssPatterns) {
      if (pattern.test(searchString)) {
        return {
          isAttack: true,
          attackType: AttackType.XSS,
          severity: 'high',
          details: `XSS pattern detected: ${pattern.toString()}`,
          confidence: 80,
        };
      }
    }

    return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
  }

  /**
   * Detect path traversal attempts
   */
  detectPathTraversal(url: string): AttackDetectionResult {
    const pathTraversalPatterns = [
      /\.\.\/|\.\.\\/g,
      /\.\.%2F|\.\.%5C/i,
      /\.\.\/\.\.\/|\.\.\\\.\.\\/g,
      /\/\.\.\/|\\\.\.\\/g,
      /\.\.%252F|\.\.%255C/i,
    ];

    for (const pattern of pathTraversalPatterns) {
      if (pattern.test(url)) {
        return {
          isAttack: true,
          attackType: AttackType.PATH_TRAVERSAL,
          severity: 'medium',
          details: `Path traversal pattern detected: ${pattern.toString()}`,
          confidence: 90,
        };
      }
    }

    return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
  }

  /**
   * Detect suspicious user agents (bots, scanners)
   */
  detectSuspiciousUserAgent(userAgent: string | undefined): AttackDetectionResult {
    if (!userAgent) {
      return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
    }

    const suspiciousPatterns = [
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /zap/i,
      /burp/i,
      /w3af/i,
      /acunetix/i,
      /nessus/i,
      /openvas/i,
      /^$/i, // Empty user agent
      /^curl/i,
      /^wget/i,
      /^python/i,
      /^java/i,
      /^go-http/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(userAgent)) {
        return {
          isAttack: true,
          attackType: AttackType.SUSPICIOUS_USER_AGENT,
          severity: 'medium',
          details: `Suspicious user agent detected: ${userAgent.substring(0, 100)}`,
          confidence: 70,
        };
      }
    }

    return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
  }

  /**
   * Detect brute force attacks (multiple failed logins from same IP)
   */
  detectBruteForce(ip: string, isFailedLogin: boolean): AttackDetectionResult {
    if (!isFailedLogin) {
      return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
    }

    const now = Date.now();
    const loginData = this.ipFailedLogins.get(ip) || { count: 0, firstSeen: now, lastSeen: now };

    // Reset if window expired
    if (now - loginData.firstSeen > this.bruteForceWindow) {
      loginData.count = 1;
      loginData.firstSeen = now;
      loginData.lastSeen = now;
    } else {
      loginData.count++;
      loginData.lastSeen = now;
    }

    this.ipFailedLogins.set(ip, loginData);

    if (loginData.count >= this.bruteForceThreshold) {
      const severity = loginData.count >= this.bruteForceThreshold * 3 ? 'critical' : 
                      loginData.count >= this.bruteForceThreshold * 2 ? 'high' : 'medium';
      
      return {
        isAttack: true,
        attackType: AttackType.BRUTE_FORCE,
        severity,
        details: `Brute force detected: ${loginData.count} failed logins from ${ip} in ${Math.round((now - loginData.firstSeen) / 1000)}s`,
        confidence: Math.min(95, 60 + (loginData.count * 5)),
      };
    }

    return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
  }

  /**
   * Detect DDoS attacks (too many requests from same IP)
   */
  detectDDoS(ip: string): AttackDetectionResult {
    const now = Date.now();
    const attackData = this.ipAttackCounts.get(ip) || { count: 0, firstSeen: now, lastSeen: now };

    // Reset if window expired
    if (now - attackData.firstSeen > this.ddosWindow) {
      attackData.count = 1;
      attackData.firstSeen = now;
      attackData.lastSeen = now;
    } else {
      attackData.count++;
      attackData.lastSeen = now;
    }

    this.ipAttackCounts.set(ip, attackData);

    const requestRate = attackData.count / ((now - attackData.firstSeen) / 1000); // requests per second

    if (attackData.count >= this.ddosThreshold || requestRate > 50) {
      const severity = requestRate > 100 ? 'critical' : 
                      requestRate > 75 ? 'high' : 
                      requestRate > 50 ? 'medium' : 'low';
      
      return {
        isAttack: true,
        attackType: AttackType.DDOS,
        severity,
        details: `DDoS detected: ${attackData.count} requests from ${ip} in ${Math.round((now - attackData.firstSeen) / 1000)}s (${requestRate.toFixed(2)} req/s)`,
        confidence: Math.min(95, 50 + (requestRate * 0.5)),
      };
    }

    return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
  }

  /**
   * Detect unauthorized access attempts
   */
  detectUnauthorizedAccess(statusCode: number): AttackDetectionResult {
    if (statusCode === 401 || statusCode === 403) {
      return {
        isAttack: true,
        attackType: AttackType.UNAUTHORIZED_ACCESS,
        severity: 'medium',
        details: `Unauthorized access attempt: HTTP ${statusCode}`,
        confidence: 60,
      };
    }

    return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
  }

  /**
   * Comprehensive attack detection
   */
  detectAttack(
    ip: string,
    url: string,
    method: string,
    body: any,
    userAgent: string | undefined,
    statusCode: number,
    isFailedLogin: boolean = false
  ): AttackDetectionResult[] {
    const results: AttackDetectionResult[] = [];

    // 1. SQL Injection detection
    const sqlResult = this.detectSQLInjection(url, body);
    if (sqlResult.isAttack) results.push(sqlResult);

    // 2. XSS detection
    const xssResult = this.detectXSS(url, body);
    if (xssResult.isAttack) results.push(xssResult);

    // 3. Path traversal detection
    const pathResult = this.detectPathTraversal(url);
    if (pathResult.isAttack) results.push(pathResult);

    // 4. Suspicious user agent detection
    const uaResult = this.detectSuspiciousUserAgent(userAgent);
    if (uaResult.isAttack) results.push(uaResult);

    // 5. Brute force detection
    const bruteResult = this.detectBruteForce(ip, isFailedLogin);
    if (bruteResult.isAttack) results.push(bruteResult);

    // 6. DDoS detection
    const ddosResult = this.detectDDoS(ip);
    if (ddosResult.isAttack) results.push(ddosResult);

    // 7. Unauthorized access detection
    const unauthResult = this.detectUnauthorizedAccess(statusCode);
    if (unauthResult.isAttack) results.push(unauthResult);

    return results;
  }

  /**
   * Get attack statistics for an IP
   */
  getIPStatistics(ip: string): {
    totalRequests: number;
    failedLogins: number;
    lastSeen: Date | null;
  } {
    const attackData = this.ipAttackCounts.get(ip);
    const loginData = this.ipFailedLogins.get(ip);

    return {
      totalRequests: attackData?.count || 0,
      failedLogins: loginData?.count || 0,
      lastSeen: attackData?.lastSeen ? new Date(attackData.lastSeen) : null,
    };
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = Math.max(this.bruteForceWindow, this.ddosWindow) * 2;

    // Cleanup IP attack counts
    for (const [ip, data] of this.ipAttackCounts.entries()) {
      if (now - data.lastSeen > maxAge) {
        this.ipAttackCounts.delete(ip);
      }
    }

    // Cleanup failed logins
    for (const [ip, data] of this.ipFailedLogins.entries()) {
      if (now - data.lastSeen > maxAge) {
        this.ipFailedLogins.delete(ip);
      }
    }

    this.logger.debug(`[AttackDetection] Cleanup completed. Active IPs: ${this.ipAttackCounts.size}, Failed logins: ${this.ipFailedLogins.size}`);
  }
}

