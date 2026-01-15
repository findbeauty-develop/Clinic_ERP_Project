import { IsArray, IsString, ValidateNested, IsOptional } from "class-validator";
import { Type } from "class-transformer";
import { ItemAdjustmentDto } from "./update-status.dto";

export class PartialAcceptDto {
  @IsArray()
  @IsString({ each: true })
  selectedItemIds!: string[]; // Item IDs to accept

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAdjustmentDto)
  adjustments?: ItemAdjustmentDto[]; // Optional adjustments for selected items

  @IsOptional()
  @IsString()
  memo?: string;
}

