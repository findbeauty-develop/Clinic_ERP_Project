import {
  IsString,
  IsNumber,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";

export class ImportProductRowDto {
  // Required
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(100)
  brand!: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  @IsString()
  @MaxLength(20)
  unit!: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  min_stock!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  capacity_per_product!: number;

  @IsString()
  @MaxLength(20)
  capacity_unit!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  usage_capacity!: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  alert_days!: number;

  @IsString()
  @MaxLength(20)
  contact_phone!: string;

  @IsString()
  @MaxLength(100)
  barcode!: string;

  // Optional
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  refund_amount?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  purchase_price?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  sale_price?: number | null;
}

export class PreviewImportDto {
  rows!: ImportProductRowDto[];
}

export class ConfirmImportDto {
  rows!: ImportProductRowDto[];

  @IsString()
  @MaxLength(100)
  inboundManager!: string;
}
