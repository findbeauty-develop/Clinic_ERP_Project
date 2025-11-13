import { IsBoolean, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  brand!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  currentStock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;
}

