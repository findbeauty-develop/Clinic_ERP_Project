import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NewsCacheService } from './news-cache.service';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(
    private configService: ConfigService,
    private cacheService: NewsCacheService, // Cache service inject
  ) {
    this.apiKey = this.configService.get<string>('DEEPSEARCH_API_KEY') || '';
    this.apiUrl = this.configService.get<string>('DEEPSEARCH_API_URL') || 'https://news.deepsearch.com/v1';
    
    if (!this.apiKey) {
      this.logger.warn('DEEPSEARCH_API_KEY is not configured in .env file');
      this.logger.warn('Please add DEEPSEARCH_API_KEY=your_api_key to apps/backend/.env');
    } else {
      this.logger.log(`DeepSearch API configured with URL: ${this.apiUrl}`);
    }
  }

  async searchNews(keywords: string[], limit: number = 10) {
    // Avval cache'dan tekshirish
    const cachedNews = await this.cacheService.getCachedNews(keywords);
    if (cachedNews) {
      this.logger.log('Returning cached news');
      return cachedNews.slice(0, limit);
    }
  
    // Cache bo'lmasa, API'dan olish
    if (!this.apiKey) {
      this.logger.warn('DeepSearch API key is not configured, returning mock data');
      return this.getMockNews(keywords, limit);
    }
  
    // DeepSearch API endpoint'larni sinab ko'rish
    // Postman'da query params'siz ishlayotgani uchun, avval params'siz olish, keyin filter qilish
    const apiConfigs = [
        // ✅ Variant 1: Query params'siz (Postman'da ishlayotgan)
        {
          url: `https://news.deepsearch.com/v1/articles`,
          method: 'GET',
          params: {}, // Query params yo'q - barcha articles'ni olish
          authHeader: `Bearer ${this.apiKey}`,
          description: 'GET /v1/articles (all articles, filter on our side)',
          filterOnClient: true, // Backend'da filter qilish
        },
        // ✅ Variant 2: Query params bilan (agar qo'llab-quvvatlasa)
        {
          url: `https://news.deepsearch.com/v1/articles`,
          method: 'GET',
          params: { 
            keywords: keywords.join(','), 
            limit: String(limit * 2), 
            language: 'ko' 
          },
          authHeader: `Bearer ${this.apiKey}`,
          description: 'GET /v1/articles with keywords filter',
          filterOnClient: false,
        },
        // Variant 3: Alternative endpoint
        {
          url: `https://news.deepsearch.com/v1/articles/search`,
          method: 'GET',
          params: { 
            q: keywords.join(' '), 
            limit: String(limit * 2), 
            language: 'ko' 
          },
          authHeader: `Bearer ${this.apiKey}`,
          description: 'GET /v1/articles/search with q parameter',
          filterOnClient: false,
        },
        // Variant 4: POST method
        {
          url: `https://news.deepsearch.com/v1/articles/search`,
          method: 'POST',
          body: { 
            keywords: keywords, 
            limit: limit * 2, 
            language: 'ko' 
          },
          authHeader: `Bearer ${this.apiKey}`,
          description: 'POST /v1/articles/search',
          filterOnClient: false,
        },
        // Variant 5: Alternative base URL
        {
          url: `${this.apiUrl}/articles`,
          method: 'GET',
          params: {}, 
          authHeader: `Bearer ${this.apiKey}`,
          description: 'GET /articles (alternative base URL)',
          filterOnClient: true,
        },
    ];

    for (const config of apiConfigs) {
      try {
        let requestUrl = config.url;
        const requestOptions: any = {
          method: config.method,
          headers: {
            'Content-Type': 'application/json',
          },
        };

        // Authentication header
        if ((config as any).headerKey) {
          requestOptions.headers[(config as any).headerKey] = config.authHeader;
        } else {
          requestOptions.headers['Authorization'] = config.authHeader;
        }

        if (config.method === 'GET' && config.params && Object.keys(config.params).length > 0) {
          // Remove undefined values from params since URLSearchParams expects string/array, not undefined
          const filteredParams: Record<string, string | readonly string[]> = {};
          for (const [key, value] of Object.entries(config.params)) {
            if (typeof value !== 'undefined') {
              filteredParams[key] = value as string | readonly string[];
            }
          }
          if (Object.keys(filteredParams).length > 0) {
            const params = new URLSearchParams(filteredParams);
            requestUrl = `${config.url}?${params.toString()}`;
          }
        } else if (config.body) {
          requestOptions.body = JSON.stringify(config.body);
        }


        this.logger.log(`Trying DeepSearch API: ${(config as any).description || config.method + ' ' + requestUrl}`);
        this.logger.log(`Request body: ${JSON.stringify(config.body || config.params)}`);

        const response = await fetch(requestUrl, requestOptions);

        this.logger.log(`Response status: ${response.status} ${response.statusText}`);

        if (response.ok) {
          const data = await response.json();
          this.logger.log(`Successfully fetched news from DeepSearch API: ${requestUrl}`);
          this.logger.log(`Response data structure: ${JSON.stringify(Object.keys(data as any)).substring(0, 200)}`);

          let formattedNews = this.formatNewsData(data);

          // Agar filterOnClient true bo'lsa, backend'da filter qilish
          if ((config as any).filterOnClient && formattedNews.length > 0) {
            formattedNews = this.filterByKeywords(formattedNews, keywords);
            this.logger.log(`Filtered ${formattedNews.length} articles by keywords: ${keywords.join(', ')}`);
          }

          if (formattedNews.length > 0) {
            // Cache'ga saqlash
            await this.cacheService.setCachedNews(keywords, formattedNews);
            return formattedNews.slice(0, limit);
          } else {
            this.logger.warn(`No news found in response from ${requestUrl}`);
          }
        } else {
          const errorText = await response.text();
          this.logger.warn(`DeepSearch API error (${requestUrl}): ${response.status} ${response.statusText}`);
          this.logger.warn(`Error response: ${errorText.substring(0, 500)}`);
          
          // 404 emas bo'lsa (masalan 401, 403), boshqa endpoint'larni sinab ko'rish
          if (response.status !== 404) {
            continue;
          }
        }
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        const errorStack = error?.stack || '';
        this.logger.warn(`Failed to fetch from ${config.url}: ${errorMessage}`);
        this.logger.debug(`Error details: ${errorStack.substring(0, 300)}`);
        
        // Network error bo'lsa, batafsil ma'lumot
        if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
          this.logger.error(`Network error: Cannot connect to ${config.url}`);
          this.logger.error(`This could mean: DNS resolution failed, SSL issue, or endpoint doesn't exist`);
        }
        continue;
      }
    }

    // Barcha endpoint'lar ishlamasa
    this.logger.warn('⚠️ All DeepSearch API endpoints failed. Using mock data.');
    this.logger.warn('Please verify:');
    this.logger.warn(`1. API key is ${this.apiKey ? 'SET' : 'NOT SET'} in apps/backend/.env`);
    this.logger.warn('2. API endpoint URL: https://news.deepsearch.com/v1/articles');
    this.logger.warn('3. Check DeepSearch website for correct API documentation');
    this.logger.warn('4. Verify API key is active and has proper permissions');
    this.logger.warn('5. Check if API requires different authentication method (X-API-Key, query param, etc.)');
    
    // Hozircha mock data qaytarish (keyinroq real API bilan almashtiriladi)
    this.logger.log(`Returning ${limit} mock news articles for keywords: ${keywords.join(', ')}`);
    return this.getMockNews(keywords, limit);
  }
  
  private getMockNews(keywords: string[], limit: number) {
    // Realistic mock news data based on keywords
    const allMockNews = [
      {
        id: 1,
        title: '의료진단 AI 기술의 최신 동향',
        source: '의료뉴스',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date().toISOString(),
        summary: '인공지능 기술이 의료 진단 분야에서 혁신적인 변화를 가져오고 있습니다.',
      },
      {
        id: 2,
        title: '신약 개발을 위한 바이오 기술 혁신',
        source: '제약저널',
        image: null,
        category: '제약·바이오',
        url: '#',
        publishedAt: new Date(Date.now() - 86400000).toISOString(), // 1 kun oldin
        summary: '최신 바이오 기술이 신약 개발 과정을 가속화하고 있습니다.',
      },
      {
        id: 3,
        title: '헬스케어 디지털 전환 가속화',
        source: '디지털헬스',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 172800000).toISOString(), // 2 kun oldin
        summary: '코로나19 이후 헬스케어 분야의 디지털 전환이 빠르게 진행되고 있습니다.',
      },
      {
        id: 4,
        title: '원격의료 서비스 확대',
        source: '의료정책',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 259200000).toISOString(), // 3 kun oldin
        summary: '정부가 원격의료 서비스 범위를 확대하기로 결정했습니다.',
      },
      {
        id: 5,
        title: '의료기기 규제 완화',
        source: '의료산업',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 345600000).toISOString(), // 4 kun oldin
        summary: '의료기기 승인 프로세스가 간소화되어 시장 진입이 빨라질 전망입니다.',
      },
      {
        id: 6,
        title: '건강검진 AI 분석 도입',
        source: '헬스케어테크',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 432000000).toISOString(), // 5 kun oldin
        summary: '대형 병원들이 건강검진 결과 분석에 AI를 도입하기 시작했습니다.',
      },
      {
        id: 7,
        title: '의료진 부족 문제 해결 방안',
        source: '의료정책',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 518400000).toISOString(), // 6 kun oldin
        summary: '의료진 부족 문제를 해결하기 위한 다양한 정책이 논의되고 있습니다.',
      },
      {
        id: 8,
        title: '의료비 절감을 위한 디지털 솔루션',
        source: '헬스케어경제',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 604800000).toISOString(), // 7 kun oldin
        summary: '의료비 절감을 위한 디지털 헬스케어 솔루션이 주목받고 있습니다.',
      },
      {
        id: 9,
        title: '개인 맞춤형 의료 시대 도래',
        source: '바이오테크',
        image: null,
        category: '제약·바이오',
        url: '#',
        publishedAt: new Date(Date.now() - 691200000).toISOString(), // 8 kun oldin
        summary: '유전자 분석 기술 발전으로 개인 맞춤형 의료 서비스가 확산되고 있습니다.',
      },
      {
        id: 10,
        title: '의료 데이터 보안 강화 방안',
        source: '의료정보',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 777600000).toISOString(), // 9 kun oldin
        summary: '의료 데이터 보안을 강화하기 위한 새로운 규정이 시행됩니다.',
      },
      {
        id: 11,
        title: '의료기관 스마트 병원 구축',
        source: '병원경영',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 864000000).toISOString(), // 10 kun oldin
        summary: '전국 주요 병원들이 스마트 병원 시스템 구축에 나서고 있습니다.',
      },
      {
        id: 12,
        title: '의료 AI 윤리 가이드라인 마련',
        source: '의료윤리',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 950400000).toISOString(), // 11 kun oldin
        summary: '의료 AI 활용을 위한 윤리 가이드라인이 마련되었습니다.',
      },
      {
        id: 13,
        title: '만성질환 관리 앱 시장 성장',
        source: '헬스케어앱',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 1036800000).toISOString(), // 12 kun oldin
        summary: '만성질환 관리 모바일 앱 시장이 급성장하고 있습니다.',
      },
      {
        id: 14,
        title: '의료진 재교육 프로그램 확대',
        source: '의료교육',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 1123200000).toISOString(), // 13 kun oldin
        summary: '의료진 재교육 프로그램이 확대되어 의료 서비스 질이 향상될 전망입니다.',
      },
      {
        id: 15,
        title: '의료기관 간 정보 공유 시스템 구축',
        source: '의료정보화',
        image: null,
        category: '의료·헬스케어',
        url: '#',
        publishedAt: new Date(Date.now() - 1209600000).toISOString(), // 14 kun oldin
        summary: '의료기관 간 환자 정보 공유 시스템이 구축되어 의료 서비스 연속성이 향상됩니다.',
      },
    ];

    // Keywords bo'yicha filter qilish
    if (keywords && keywords.length > 0) {
      const lowerKeywords = keywords.map(k => k.toLowerCase().trim());
      const filtered = allMockNews.filter(article => {
        const title = (article.title || '').toLowerCase();
        const summary = (article.summary || '').toLowerCase();
        const category = (article.category || '').toLowerCase();
        
        return lowerKeywords.some(keyword => 
          title.includes(keyword) || 
          summary.includes(keyword) || 
          category.includes(keyword)
        );
      });
      
      // Agar filter qilingan natijalar yetarli bo'lmasa, barcha news'larni qaytarish
      if (filtered.length === 0) {
        this.logger.log(`No mock news found for keywords: ${keywords.join(', ')}, returning all news`);
        return allMockNews.slice(0, limit);
      }
      
      return filtered.slice(0, limit);
    }
    
    return allMockNews.slice(0, limit);
  }
  private formatNewsData(data: any) {
    // Turli xil response formatlarini qo'llab-quvvatlash
    let articles: any[] = [];

    // Format 1: data.articles
    if (Array.isArray(data.articles)) {
      articles = data.articles;
    }
    // Format 2: data.data
    else if (Array.isArray(data.data)) {
      articles = data.data;
    }
    // Format 3: data.results
    else if (Array.isArray(data.results)) {
      articles = data.results;
    }
    // Format 4: data o'zi array
    else if (Array.isArray(data)) {
      articles = data;
    }
    // Format 5: data.items
    else if (Array.isArray(data.items)) {
      articles = data.items;
    }

    return articles.map((article: any, index: number) => ({
      id: article.id || article._id || index + 1,
      title: article.title || article.headline || article.name || '제목 없음',
      source: article.source || article.publisher || article.author || article.site || '알 수 없음',
      image: article.image || article.thumbnail || article.cover || article.picture || null,
      category: article.category || article.topic || article.section || '일반',
      url: article.url || article.link || article.permalink || '#',
      publishedAt: article.publishedAt || article.date || article.published_date || article.createdAt || new Date().toISOString(),
      summary: article.summary || article.description || article.excerpt || article.content?.substring(0, 200) || '',
    }));
  }

  private filterByKeywords(articles: any[], keywords: string[]): any[] {
    if (!keywords || keywords.length === 0) {
      return articles;
    }

    // Keyword'larni kichik harflarga o'tkazish
    const lowerKeywords = keywords.map(k => k.toLowerCase().trim());

    return articles.filter(article => {
      const title = (article.title || '').toLowerCase();
      const summary = (article.summary || '').toLowerCase();
      const category = (article.category || '').toLowerCase();

      // Hech bo'lmaganda bitta keyword topilsa, qaytarish
      return lowerKeywords.some(keyword => 
        title.includes(keyword) || 
        summary.includes(keyword) || 
        category.includes(keyword)
      );
    });
  }
}