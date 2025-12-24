import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { NewsController } from "./controller/news.controller";
import { NewsService } from "./services/news.service";
import { DataGoKrService } from "./services/data-go-kr.service";
import { RssFeedService } from "./services/rss-feed.service";

@Module({
  imports: [HttpModule],
  controllers: [NewsController],
  providers: [NewsService, DataGoKrService, RssFeedService],
})
export class NewsModule {}
