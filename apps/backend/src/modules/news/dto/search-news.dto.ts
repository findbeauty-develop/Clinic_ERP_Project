import { IsString, IsOptional, IsNumber, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export class SearchNewsDto {
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  pageNo?: number = 1;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  @IsOptional()
  numOfRows?: number = 10;

  @IsString()
  @IsOptional()
  searchKeyword?: string;

  @IsString()
  @IsOptional()
  withImage?: string; // 🆕 Added filter for news with images: 'true' or 'false'
}
