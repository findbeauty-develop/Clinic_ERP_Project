import { IsString, IsArray, ValidateNested, IsNumber, IsOptional } from "class-validator";
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
  @IsOptional() // ✅ Optional - orderId URL'dan keladi
  orderId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartialInboundItemDto)
  inboundedItems!: PartialInboundItemDto[];

  @IsString()
  inboundManager!: string;
}
