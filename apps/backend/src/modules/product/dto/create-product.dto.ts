import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsArray,
} from "class-validator";
import { Type } from "class-transformer";

export class ReturnPolicyDto {
  @IsBoolean()
  is_returnable!: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  refund_amount?: number;

  @IsOptional()
  @IsString()
  return_storage?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateBatchDto {
  @IsString()
  batch_no!: string;

  @IsOptional()
  @IsString()
  storage?: string;

  @IsOptional()
  @IsInt()
  purchase_price?: number;

  @IsOptional()
  @IsInt()
  sale_price?: number;

  @IsOptional()
  @IsString()
  manufacture_date?: string;

  @IsOptional()
  @IsString()
  expiry_date?: string;

  @IsOptional()
  @IsInt()
  expiry_months?: number;

  @IsInt()
  qty!: number;

  @IsOptional()
  @IsString()
  alert_days?: string;
}

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
  image?: string;

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

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReturnPolicyDto)
  returnPolicy?: ReturnPolicyDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBatchDto)
  initial_batches?: CreateBatchDto[];
}

