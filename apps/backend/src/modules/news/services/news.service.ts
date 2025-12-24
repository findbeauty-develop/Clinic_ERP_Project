import { Injectable } from "@nestjs/common";
import { NewsApiService } from "./newsapi.service";
import { Article, NewsApiResponse } from "../interface/news.interface";
import { SearchNewsDto } from "../dto/search-news.dto";

@Injectable()
export class NewsService {
  constructor(private readonly newsApiService: NewsApiService) {}

  private filterArticlesWithImages(articles: Article[]): Article[] {
    return articles.filter(
      (article) =>
        article.urlToImage &&
        article.urlToImage.trim() !== "" &&
        article.urlToImage !== "null"
    );
  }

  async getTopHeadlines(
    category?: string,
    pageSize?: number,
    page?: number,
    withImage?: boolean
  ): Promise<NewsApiResponse> {
    const result = await this.newsApiService.getTopHeadlines(
      category,
      pageSize,
      page
    );

    if (withImage) {
      result.articles = this.filterArticlesWithImages(result.articles);
      result.totalResults = result.articles.length;
    }

    return result;
  }

  async searchNews(searchDto: SearchNewsDto): Promise<NewsApiResponse> {
    const { q, pageSize, page, sortBy, withImage } = searchDto;

    if (!q) {
      throw new Error("Search query is required");
    }
    const result = await this.newsApiService.searchNews(
      q,
      pageSize,
      page,
      sortBy
    );

    if (withImage) {
      result.articles = this.filterArticlesWithImages(result.articles);
      result.totalResults = result.articles.length;
    }

    return result;
  }

  async getNewsByCategory(
    category: string,
    pageSize?: number,
    page?: number,
    withImage?: boolean
  ): Promise<NewsApiResponse> {
    const result = await this.newsApiService.getTopHeadlines(
      category,
      pageSize,
      page
    );

    if (withImage) {
      result.articles = this.filterArticlesWithImages(result.articles);
      result.totalResults = result.articles.length;
    }

    return result;
  }

  async getNewsSources() {
    return this.newsApiService.getNewsSources();
  }

  async getNewsWithImages(
    category?: string,
    pageSize: number = 20
  ): Promise<NewsApiResponse> {
    const result = await this.newsApiService.getTopHeadlines(
      category,
      pageSize,
      1
    );
    result.articles = this.filterArticlesWithImages(result.articles);
    result.totalResults = result.articles.length;
    return result;
  }
}
