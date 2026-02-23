import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
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

  // 별도 구매 여부 (Separate purchase flag) - optional
  @IsOptional()
  @IsBoolean()
  is_separate_purchase?: boolean;

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
  @IsOptional()
  @IsString()
  supplier_id?: string; // UUID yoki company name (legacy)

  @IsOptional()
  @IsString()
  company_name?: string; // Alohida company name field

  @IsOptional()
  @IsString()
  business_number?: string; // Business registration number

  @IsOptional()
  @IsString()
  company_phone?: string; // Company phone

  @IsOptional()
  @IsString()
  company_email?: string; // Company email

  @IsOptional()
  @IsString()
  company_address?: string; // Company address

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

  /** Required. Used for GTIN duplicate prevention (one product per barcode per tenant). */
  @IsString()
  @MinLength(1, { message: "barcode must not be empty" })
  barcode!: string;

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
  @IsNumber()
  @Min(0)
  capacityPerProduct?: number;

  @IsOptional()
  @IsString()
  capacityUnit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  usageCapacity?: number;

  // Product-level expiry defaults
  @IsOptional()
  @IsInt()
  @Min(0)
  expiryMonths?: number;

  @IsOptional()
  @IsString()
  expiryUnit?: string;

  @IsOptional()
  @IsString()
  alertDays?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  inboundManager?: string;

  // Packaging unit conversion
  @IsOptional()
  @IsBoolean()
  hasDifferentPackagingQuantity?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  packagingFromQuantity?: number;

  @IsOptional()
  @IsString()
  packagingFromUnit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  packagingToQuantity?: number;

  @IsOptional()
  @IsString()
  packagingToUnit?: string;

  @IsOptional()
  @IsString()
  storage?: string;

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
