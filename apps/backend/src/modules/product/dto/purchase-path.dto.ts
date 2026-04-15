import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from "class-validator";

export type PurchasePathTypeDto = "MANAGER" | "SITE" | "OTHER";

export class CreatePurchasePathDto {
  @IsIn(["MANAGER", "SITE", "OTHER"])
  pathType!: PurchasePathTypeDto;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ValidateIf((o) => o.pathType === "MANAGER")
  @IsString()
  clinicSupplierManagerId?: string;

  @ValidateIf((o) => o.pathType === "SITE")
  @IsOptional()
  @IsString()
  siteName?: string;

  @ValidateIf((o) => o.pathType === "SITE")
  @IsString()
  siteUrl?: string;

  @ValidateIf((o) => o.pathType === "OTHER")
  @IsString()
  otherText?: string;
}

export class UpdatePurchasePathDto {
  @IsOptional()
  @IsIn(["MANAGER", "SITE", "OTHER"])
  pathType?: PurchasePathTypeDto;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  clinicSupplierManagerId?: string;

  @IsOptional()
  @IsString()
  siteName?: string;

  @IsOptional()
  @IsString()
  siteUrl?: string;

  @IsOptional()
  @IsString()
  otherText?: string;
}
