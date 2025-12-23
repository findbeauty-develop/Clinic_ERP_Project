import { IsString, IsOptional, IsArray, ValidateNested, IsInt, Min, IsNumber } from "class-validator";
import { Type } from "class-transformer";

export class OrderItemDto {
  @IsString()
  productId!: string;

  @IsString()
  @IsOptional()
  batchId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsInt()
  @Min(0)
  unitPrice!: number;

  @IsString()
  @IsOptional()
  memo?: string;
}

export class CreateOrderDto {
  @IsString()
  @IsOptional()
  supplierId?: string;

  // items ixtiyoriy, chunki draft'dan olinadi
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @IsString()
  @IsOptional()
  memo?: string;

  @IsString()
  @IsOptional()
  expectedDeliveryDate?: string; // ISO date string

  // Supplier bo'yicha memo'lar (supplierId -> memo mapping)
  @IsOptional()
  supplierMemos?: Record<string, string>; // { [supplierId]: memo }

  @IsString()
  @IsOptional()
  clinicManagerName?: string; // 클리닉 담당자 이름
}

