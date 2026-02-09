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

  // ✅ Whitelist configuration
  private readonly whitelistedIPs: string[];
  private readonly whitelistedUserAgents: string[];

  constructor(private readonly configService: ConfigService) {
    // Configuration from environment variables
    this.bruteForceThreshold = Number(this.configService.get('ATTACK_BRUTE_FORCE_THRESHOLD')) || 5; // 5 failed logins
    this.bruteForceWindow = Number(this.configService.get('ATTACK_BRUTE_FORCE_WINDOW')) || 15 * 60 * 1000; // 15 minutes
    this.ddosThreshold = Number(this.configService.get('ATTACK_DDOS_THRESHOLD')) || 100; // 100 requests
    this.ddosWindow = Number(this.configService.get('ATTACK_DDOS_WINDOW')) || 60 * 1000; // 1 minute
    this.cleanupInterval = Number(this.configService.get('ATTACK_CLEANUP_INTERVAL')) || 60 * 60 * 1000; // 1 hour

    // ✅ Whitelist configuration from environment variables
    const whitelistIPsEnv = this.configService.get<string>('ATTACK_WHITELIST_IPS') || '';
    this.whitelistedIPs = [
      '127.0.0.1',
      'localhost',
      '::1',
      '::ffff:127.0.0.1',
      '172.18.0.1', // Docker network gateway
      '172.18.0.4', // Prometheus container (common)
      '172.18.0.5', // Grafana container (common)
      ...whitelistIPsEnv.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0),
    ];

    const whitelistUAsEnv = this.configService.get<string>('ATTACK_WHITELIST_USER_AGENTS') || '';
    this.whitelistedUserAgents = [
      'Prometheus',
      'Grafana',
      'Go-http-client',
      'node-fetch',
      ...whitelistUAsEnv.split(',').map(ua => ua.trim()).filter(ua => ua.length > 0),
    ];

    this.logger.log(`[AttackDetection] Whitelist configured: ${this.whitelistedIPs.length} IPs, ${this.whitelistedUserAgents.length} User-Agents`);

    // Cleanup old entries periodically
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  /**
   * Check if IP is whitelisted (internal services)
   */
  private isWhitelistedIP(ip: string): boolean {
    if (!ip) return false;
    
    // Remove IPv6 prefix if present
    const cleanIP = ip.replace('::ffff:', '');
    
    // Check exact match or partial match
    return this.whitelistedIPs.some(whitelisted => {
      const cleanWhitelisted = whitelisted.replace('::ffff:', '');
      return cleanIP === cleanWhitelisted || 
             cleanIP.includes(cleanWhitelisted) || 
             ip.includes(whitelisted) ||
             // Docker network range check
             (cleanIP.startsWith('172.18.0.') && cleanWhitelisted.startsWith('172.18.0.'));
    });
  }

  /**
   * Check if user agent is whitelisted (internal services)
   */
  private isWhitelistedUserAgent(userAgent: string | undefined): boolean {
    if (!userAgent) return false;
    return this.whitelistedUserAgents.some(whitelisted => 
      userAgent.includes(whitelisted)
    );
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
   * Checks both URL path and query string parameters
   */
  detectPathTraversal(url: string, bodyOrQuery?: any): AttackDetectionResult {
    if (!url) {
      return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
    }

    const pathTraversalPatterns = [
      /\.\.\/|\.\.\\/g,
      /\.\.%2[Ff]|\.\.%5[Cc]/i, // ✅ Case-insensitive encoded
      /\.\.\/\.\.\/|\.\.\\\.\.\\/g,
      /\/\.\.\/|\\\.\.\\/g,
      /\.\.%25[2][Ff]|\.\.%25[5][Cc]/i, // ✅ Double-encoded case-insensitive
      // ✅ Encoded patterns (case-insensitive)
      /%2[Ee]%2[Ee]%2[Ff]|%2[Ee]%2[Ee]%5[Cc]/i,
      /%25[2][Ee]%25[2][Ee]%25[2][Ff]|%25[2][Ee]%25[2][Ee]%25[5][Cc]/i,
      // ✅ Triple-encoded patterns
      /%25[2][5][2][Ee]%25[2][5][2][Ee]%25[2][5][2][Ff]/i,
      // ✅ Simple patterns (most common)
      /\.\.%2F/i, // Direct match for ..%2F
      /%2E%2E%2F/i, // Direct match for %2E%2E%2F
      /%252E%252E%252F/i, // Direct match for %252E%252E%252F
    ];

    // ✅ Combine URL and body/query params for detection
    let searchString = url;
    
    // ✅ Add body/query params to search string
    if (bodyOrQuery) {
      try {
        const bodyString = JSON.stringify(bodyOrQuery);
        searchString += ' ' + bodyString;
      } catch (e) {
        // If JSON.stringify fails, try toString
        searchString += ' ' + String(bodyOrQuery);
      }
    }

    // ✅ Check both original URL and decoded versions
    try {
      // Try to decode URL to check for encoded patterns
      const decodedUrl = decodeURIComponent(url);
      searchString = searchString + ' ' + decodedUrl; // Check both encoded and decoded
      
      // Also try double decode
      try {
        const doubleDecoded = decodeURIComponent(decodedUrl);
        searchString += ' ' + doubleDecoded;
      } catch (e) {
        // Ignore double decode errors
      }
    } catch (e) {
      // If decode fails, just use original searchString
    }

    // ✅ Production'da ham log ko'rinishi uchun warn level'da log qo'shamiz
    // ✅ bodyOrQuery'ni ham tekshirish kerak
    const bodyString = bodyOrQuery ? JSON.stringify(bodyOrQuery) : '';
    const combinedString = url + ' ' + bodyString;
    const hasSuspiciousPattern = combinedString.includes('%2F') || 
                                combinedString.includes('../') || 
                                combinedString.includes('..%') ||
                                combinedString.includes('%2E%2E') ||
                                combinedString.includes('..\\');
    
    if (hasSuspiciousPattern) {
      this.logger.warn(`[PathTraversal] Checking URL: ${url.substring(0, 150)}`);
      this.logger.warn(`[PathTraversal] Body/Query: ${bodyString.substring(0, 200)}`);
      this.logger.warn(`[PathTraversal] Search string preview: ${searchString.substring(0, 300)}`);
    }

    for (const pattern of pathTraversalPatterns) {
      if (pattern.test(searchString)) {
        // ✅ Production'da ham log ko'rinishi uchun warn level'da log
        this.logger.warn(`[PathTraversal] ✅ Pattern matched: ${pattern.toString()} in URL: ${url.substring(0, 100)}`);
        
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
    // ✅ Skip DDoS detection for whitelisted IPs
    if (this.isWhitelistedIP(ip)) {
      return { isAttack: false, attackType: null, severity: 'low', details: '', confidence: 0 };
    }

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

    // ✅ Skip detection for whitelisted IPs and user agents (except for SQL/XSS/Path traversal which are content-based)
    const isWhitelisted = this.isWhitelistedIP(ip) || this.isWhitelistedUserAgent(userAgent);

    // 1. SQL Injection detection (always check - content-based)
    const sqlResult = this.detectSQLInjection(url, body);
    if (sqlResult.isAttack) results.push(sqlResult);

    // 2. XSS detection (always check - content-based)
    const xssResult = this.detectXSS(url, body);
    if (xssResult.isAttack) results.push(xssResult);

    // 3. Path traversal detection (always check - content-based)
    // ✅ Pass both URL and body/query params for path traversal detection
    const pathResult = this.detectPathTraversal(url, body);
    if (pathResult.isAttack) results.push(pathResult);

    // 4. Suspicious user agent detection
    const uaResult = this.detectSuspiciousUserAgent(userAgent);
    if (uaResult.isAttack) results.push(uaResult);

    // 5. Brute force detection (✅ ALWAYS check - login attacks are critical even from whitelisted IPs)
    const bruteResult = this.detectBruteForce(ip, isFailedLogin);
    if (bruteResult.isAttack) results.push(bruteResult);

    // 6. Unauthorized access detection (✅ ALWAYS check - security-critical, even from whitelisted IPs)
    const unauthResult = this.detectUnauthorizedAccess(statusCode);
    if (unauthResult.isAttack) results.push(unauthResult);

    // ✅ Skip rate-based detection for whitelisted IPs/User-Agents (DDoS only)
    if (isWhitelisted) {
      return results; // Return content-based, brute force, and unauthorized access attacks, but skip DDoS
    }

    // 7. DDoS detection (skip for whitelisted IPs)
    const ddosResult = this.detectDDoS(ip);
    if (ddosResult.isAttack) results.push(ddosResult);

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

