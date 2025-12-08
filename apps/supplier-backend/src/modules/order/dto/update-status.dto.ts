import { IsIn, IsOptional, IsString, IsArray, ValidateNested, IsInt, Min } from "class-validator";
import { Type } from "class-transformer";

export class ItemAdjustmentDto {
  @IsString()
  itemId!: string;

  @IsInt()
  @Min(0)
  actualQuantity!: number;

  @IsInt()
  @Min(0)
  actualPrice!: number;

  @IsOptional()
  @IsString()
  quantityChangeReason?: string;

  @IsOptional()
  @IsString()
  quantityChangeNote?: string;

  @IsOptional()
  @IsString()
  priceChangeReason?: string;

  @IsOptional()
  @IsString()
  priceChangeNote?: string;
}

export class UpdateOrderStatusDto {
  @IsString()
  @IsIn(["pending", "confirmed", "rejected", "shipped", "completed"])
  status!: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAdjustmentDto)
  adjustments?: ItemAdjustmentDto[];
}

