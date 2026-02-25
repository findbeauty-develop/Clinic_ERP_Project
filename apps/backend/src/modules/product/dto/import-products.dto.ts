import {
  IsString,
  IsNumber,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  MaxLength,
} from "class-validator";
import { Type, Transform } from "class-transformer";

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

  /** 유효기간 있음 (제품에 유효기간 추적 여부). Required: true or false. Accepts 예/아니오, 1/0, true/false. */
  @IsBoolean({ message: "유효기간 있음(예/아니오) 필수 입력입니다." })
  @Transform(({ value }) => {
    if (typeof value === "boolean") return value;
    const s = String(value ?? "").trim().toLowerCase();
    if (s === "예" || s === "1" || s === "true" || s === "y" || s === "yes") return true;
    if (s === "아니오" || s === "0" || s === "false" || s === "n" || s === "no") return false;
    return undefined;
  })
  has_expiry_period!: boolean;

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
