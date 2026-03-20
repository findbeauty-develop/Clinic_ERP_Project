import {
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
} from "class-validator";
import { Type, Transform } from "class-transformer";

class PartialInboundItemDto {
  @Transform(({ value }) => (value != null ? String(value) : value))
  @IsString()
  itemId!: string;

  @Transform(({ value }) => (value != null ? String(value) : undefined))
  @IsString()
  @IsOptional()
  productId?: string;

  @Transform(({ value }) =>
    typeof value === "string" ? parseInt(value, 10) : value
  )
  @IsNumber()
  inboundQty!: number;
}

export class PartialInboundDto {
  @IsString()
  @IsOptional()
  orderId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartialInboundItemDto)
  inboundedItems!: PartialInboundItemDto[];

  @IsString()
  @IsOptional()
  inboundManager?: string;
}
