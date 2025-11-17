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
  @IsOptional()
  @IsString()
  batch_no?: string;

  // 입고 수량 (Inbound quantity) - required
  @IsInt()
  @Min(1)
  qty!: number;

  // 유형 기간 (Expiry period)
  @IsOptional()
  @IsInt()
  expiry_months?: number;

  @IsOptional()
  @IsString()
  expiry_unit?: string;

  // 제조일 (Manufacture date) - optional
  @IsOptional()
  @IsString()
  manufacture_date?: string;

  // 보관 위치 (Storage location) - optional
  @IsOptional()
  @IsString()
  storage?: string;

  // 구매원가(원) (Purchase price in KRW) - optional
  @IsOptional()
  @IsInt()
  purchase_price?: number;

  // 입고 담당자 (Inbound manager/responsible person) - optional
  @IsOptional()
  @IsString()
  inbound_manager?: string;

  // Additional optional fields
  @IsOptional()
  @IsInt()
  sale_price?: number;

  @IsOptional()
  @IsString()
  expiry_date?: string;

  @IsOptional()
  @IsString()
  alert_days?: string;
}

export class LinkSupplierDto {
  @IsString()
  supplier_id!: string;

  @IsOptional()
  @IsInt()
  purchase_price?: number;

  @IsOptional()
  @IsInt()
  moq?: number;

  @IsOptional()
  @IsInt()
  lead_time_days?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  contact_name?: string;

  @IsOptional()
  @IsString()
  contact_phone?: string;

  @IsOptional()
  @IsString()
  contact_email?: string;
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
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsInt()
  purchasePrice?: number;

  @IsOptional()
  @IsInt()
  salePrice?: number;

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
  @IsInt()
  @Min(0)
  capacityPerProduct?: number;

  @IsOptional()
  @IsString()
  capacityUnit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  usageCapacity?: number;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkSupplierDto)
  suppliers?: LinkSupplierDto[];
}
