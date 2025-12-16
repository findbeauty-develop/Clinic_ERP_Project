import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { NewsService } from '../services/news.service';
import { JwtTenantGuard } from '../../../common/guards/jwt-tenant.guard';

@ApiTags('news')
@Controller('news')
@UseGuards(JwtTenantGuard)
@ApiBearerAuth()
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search news by keywords' })
  @ApiQuery({ name: 'keywords', required: true, type: String, description: 'Comma-separated keywords' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of results (default: 10)' })
  async searchNews(
    @Query('keywords') keywords?: string,
    @Query('limit') limit?: string,
  ) {
    if (!keywords || keywords.trim() === '') {
      throw new BadRequestException('Keywords parameter is required');
    }
    
    const keywordArray = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (keywordArray.length === 0) {
      throw new BadRequestException('At least one valid keyword is required');
    }
    
    const limitNum = limit ? parseInt(limit, 10) : 10;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Limit must be a number between 1 and 100');
    }
    
    return this.newsService.searchNews(keywordArray, limitNum);
  }
}