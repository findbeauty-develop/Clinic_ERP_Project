import { IsString, IsArray, ValidateNested, IsNumber } from "class-validator";
import { Type } from "class-transformer";

class PartialInboundItemDto {
  @IsString()
  itemId!: string;

  @IsString()
  productId!: string;

  @IsNumber()
  inboundQty!: number;
}

export class PartialInboundDto {
  @IsString()
  orderId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartialInboundItemDto)
  inboundedItems!: PartialInboundItemDto[];

  @IsString()
  inboundManager!: string;
}
