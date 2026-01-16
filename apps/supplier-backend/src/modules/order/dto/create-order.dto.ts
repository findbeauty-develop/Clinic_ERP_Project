import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

class CreateOrderItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @IsNotEmpty()
  productName!: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsInt()
  @Min(0)
  unitPrice!: number;

  @IsInt()
  @Min(0)
  totalPrice!: number;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  orderNo!: string;

  @IsString()
  @IsNotEmpty()
  supplierTenantId!: string;

  @IsOptional()
  @IsString()
  supplierManagerId?: string;

  @IsOptional()
  @IsString()
  clinicTenantId?: string;

  @IsOptional()
  @IsString()
  clinicName?: string;

  @IsOptional()
  @IsString()
  clinicManagerName?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsInt()
  @Min(0)
  totalAmount!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}

