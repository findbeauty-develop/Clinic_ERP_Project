import { IsString, IsOptional, IsNumber, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export class OrderProductsQueryDto {
  @IsString()
  @IsOptional()
  search?: string; // Product name, brand, supplier bo'yicha qidiruv

  @IsString()
  @IsOptional()
  supplierId?: string; // Supplier bo'yicha filter

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  @Min(0)
  @Max(1)
  minRiskScore?: number; // Minimum risk score filter

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  @Min(0)
  @Max(1)
  maxRiskScore?: number; // Maximum risk score filter

  @IsString()
  @IsOptional()
  riskLevel?: "high" | "medium" | "low"; // Risk level filter
}
