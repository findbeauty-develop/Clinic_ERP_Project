import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";

export class ImportProductRowDto {
  // Basic Info (Required)
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(100)
  brand!: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  // Inventory Management (Required)
  @IsInt()
  @Min(0)
  @Type(() => Number)
  inbound_qty!: number;

  @IsString()
  @MaxLength(20)
  unit!: string; // Dynamic unit (EA, BOX, 개, 병, etc.)

  @IsInt()
  @Min(0)
  @Type(() => Number)
  min_stock!: number;

  // Capacity Info (Required)
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

  // Expiry Management (Required)
  @IsDateString()
  expiry_date!: string; // YYYY-MM-DD

  @IsInt()
  @Min(0)
  @Type(() => Number)
  alert_days!: number;

  // Storage (Required)
  @IsString()
  @MaxLength(50)
  storage!: string;

  // Optional Fields
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

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

  // Supplier Linking (Optional)
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contact_phone?: string; // Optional: Auto-links to ClinicSupplierManager
}

export class PreviewImportDto {
  rows!: ImportProductRowDto[];
}

export class ConfirmImportDto {
  rows!: ImportProductRowDto[];
}
