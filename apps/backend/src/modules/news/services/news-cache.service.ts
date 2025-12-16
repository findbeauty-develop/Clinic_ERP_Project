import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma.service';

@Injectable()
export class NewsCacheService {
  private readonly logger = new Logger(NewsCacheService.name);
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 kun millisecond'larda

  constructor(private prisma: PrismaService) {}

  async getCachedNews(keywords: string[]): Promise<any[] | null> {
    const cacheKey = this.generateCacheKey(keywords);
    
    try {
      // Database'dan cache'ni olish (yoki Redis ishlatish mumkin)
      const cached = await this.prisma.newsCache.findUnique({
        where: { cache_key: cacheKey },
      });

      if (cached && this.isCacheValid(cached.updated_at)) {
        this.logger.log(`Cache hit for keywords: ${keywords.join(', ')}`);
        return JSON.parse(cached.data);
      }

      this.logger.log(`Cache miss for keywords: ${keywords.join(', ')}`);
      return null;
    } catch (error) {
      this.logger.error('Failed to get cached news', error);
      return null;
    }
  }

  async setCachedNews(keywords: string[], data: any[]): Promise<void> {
    const cacheKey = this.generateCacheKey(keywords);
    
    try {
      await this.prisma.newsCache.upsert({
        where: { cache_key: cacheKey },
        update: {
          data: JSON.stringify(data),
          updated_at: new Date(),
        },
        create: {
          cache_key: cacheKey,
          data: JSON.stringify(data),
          updated_at: new Date(),
        },
      });
      this.logger.log(`News cached for keywords: ${keywords.join(', ')}`);
    } catch (error) {
      this.logger.error('Failed to cache news', error);
    }
  }

  private generateCacheKey(keywords: string[]): string {
    return `news_${keywords.sort().join('_')}`;
  }

  private isCacheValid(updatedAt: Date): boolean {
    const now = new Date();
    const diff = now.getTime() - updatedAt.getTime();
    return diff < this.CACHE_DURATION;
  }
}