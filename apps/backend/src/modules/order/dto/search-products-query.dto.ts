import { IsString, IsOptional, IsNumber, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export class SearchProductsQueryDto {
  @IsString()
  @IsOptional()
  search?: string; // Product name, brand, supplier bo'yicha qidiruv

  @IsString()
  @IsOptional()
  supplierId?: string; // Supplier bo'yicha filter

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  @Min(1)
  page?: number; // Pagination page (default: 1)

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number; // Items per page (default: 20, max: 100)
}
