import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsIn,
  IsBoolean,
} from "class-validator";
import { Transform, Type } from "class-transformer";

export class SearchNewsDto {
  @IsString()
  @IsOptional()
  q?: string; // 검색 키워드

  @IsString()
  @IsOptional()
  @IsIn([
    "business",
    "entertainment",
    "general",
    "health",
    "science",
    "sports",
    "technology",
  ])
  category?: string;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number = 20;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @IsString()
  @IsOptional()
  @IsIn(["relevancy", "popularity", "publishedAt"])
  sortBy?: string = "publishedAt";

  @IsBoolean()
  @Transform(({ value }) => value === "true" || value === true)
  @IsOptional()
  withImage?: boolean = false;
}
