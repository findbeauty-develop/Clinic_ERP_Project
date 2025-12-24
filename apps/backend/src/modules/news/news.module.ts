import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { NewsController } from "./controller/news.controller";
import { NewsService } from "./services/news.service";
import { NewsApiService } from "./services/newsapi.service";

@Module({
  imports: [HttpModule],
  controllers: [NewsController],
  providers: [NewsService, NewsApiService],
})
export class NewsModule {}
