import { Logger } from "@nestjs/common";

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  lastAccessed: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
  memoryEstimate: string;
}

/**
 * CacheManager options
 */
export interface CacheManagerOptions {
  maxSize?: number; // Maximum number of entries (default: 100)
  ttl?: number; // Time to live in milliseconds (default: 30000)
  cleanupInterval?: number; // Cleanup interval in milliseconds (default: 60000)
  name?: string; // Cache name for logging
}

/**
 * Thread-safe in-memory cache manager with:
 * - TTL support
 * - Size limits with LRU eviction
 * - Automatic cleanup of expired entries
 * - Memory usage tracking
 * - Cache statistics
 */
export class CacheManager<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxSize: number;
  private readonly ttl: number;
  private readonly cleanupInterval: number;
  private readonly name: string;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly logger: Logger;

  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(options: CacheManagerOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize ?? 100;
    this.ttl = options.ttl ?? 30000; // 30 seconds default
    this.cleanupInterval = options.cleanupInterval ?? 60000; // 1 minute default
    this.name = options.name ?? "Cache";
    this.logger = new Logger(`CacheManager:${this.name}`);

    // Start automatic cleanup
    this.startCleanup();
  }

  /**
   * Get value from cache
   * @param key Cache key
   * @returns Cached value or null if not found/expired
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    // Check if expired
    if (age > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update last accessed time for LRU
    entry.lastAccessed = now;
    this.stats.hits++;

    return entry.value;
  }

  /**
   * Get value from cache with staleness check
   * @param key Cache key
   * @returns Object with data and isStale flag
   */
  getWithStaleCheck(key: string): { data: T; isStale: boolean } | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    // Update last accessed time for LRU
    entry.lastAccessed = now;
    this.stats.hits++;

    return {
      data: entry.value,
      isStale: age > this.ttl,
    };
  }

  /**
   * Set value in cache
   * @param key Cache key
   * @param value Value to cache
   */
  set(key: string, value: T): void {
    const now = Date.now();

    // Check size limit - evict LRU entries if needed
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      timestamp: now,
      lastAccessed: now,
    });
  }

  /**
   * Delete entry from cache
   * @param key Cache key
   * @returns true if entry was deleted, false if not found
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete entries by key pattern
   * @param pattern String pattern or RegExp to match keys
   * @returns Number of deleted entries
   */
  deletePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));

    if (keysToDelete.length > 0) {
      this.logger.debug(
        `Deleted ${keysToDelete.length} entries matching pattern: ${pattern}`
      );
    }

    return keysToDelete.length;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.debug(`Cleared ${size} entries`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const memoryEstimate = this.estimateMemoryUsage();

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      memoryEstimate,
    };
  }

  /**
   * Cleanup expired entries
   * @returns Number of cleaned entries
   */
  cleanup(): number {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > this.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));

    if (keysToDelete.length > 0) {
      this.logger.debug(
        `Cleanup: removed ${keysToDelete.length} expired entries`
      );
    }

    return keysToDelete.length;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.logger.debug(`Evicted LRU entry: ${oldestKey}`);
    }
  }

  /**
   * Start automatic cleanup
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      const cleaned = this.cleanup();
      const stats = this.getStats();

      // Log stats periodically (only if there's activity)
      if (stats.size > 0 || cleaned > 0) {
        this.logger.debug(
          `Stats: size=${stats.size}/${stats.maxSize}, hits=${stats.hits}, misses=${stats.misses}, evictions=${stats.evictions}, memory≈${stats.memoryEstimate}`
        );
      }
    }, this.cleanupInterval);
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): string {
    // Rough estimation: each entry ~1KB (depends on data structure)
    const estimatedBytes = this.cache.size * 1024;

    if (estimatedBytes < 1024) {
      return `${estimatedBytes} B`;
    } else if (estimatedBytes < 1024 * 1024) {
      return `${(estimatedBytes / 1024).toFixed(2)} KB`;
    } else {
      return `${(estimatedBytes / 1024 / 1024).toFixed(2)} MB`;
    }
  }

  /**
   * Destroy cache manager (cleanup resources)
   */
  destroy(): void {
    this.stopCleanup();
    this.clear();
  }
}
