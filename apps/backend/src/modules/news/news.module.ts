import { Module } from '@nestjs/common';
import { NewsController } from './controller/news.controller';
import { NewsService } from './services/news.service';
import { NewsCacheService } from './services/news-cache.service';
import { PrismaService } from '../../core/prisma.service';
import { SupabaseService } from '../../common/supabase.service';
import { JwtTenantGuard } from '../../common/guards/jwt-tenant.guard';

@Module({
  controllers: [NewsController],
  providers: [
    NewsService,
    NewsCacheService,
    PrismaService,
    SupabaseService, 
    JwtTenantGuard, 
  ],
})
export class NewsModule {}