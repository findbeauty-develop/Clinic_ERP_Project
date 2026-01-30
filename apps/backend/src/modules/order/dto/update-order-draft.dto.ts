import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class DraftOrderItemDto {
  @IsString()
  productId!: string;

  @IsString()
  @IsOptional()
  batchId?: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsInt()
  @Min(0)
  unitPrice!: number;

  @IsString()
  @IsOptional()
  memo?: string;
}

export class UpdateOrderDraftDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftOrderItemDto)
  items!: DraftOrderItemDto[];
}

export class AddOrderDraftItemDto {
  @IsString()
  productId!: string;

  @IsString()
  @IsOptional()
  batchId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @IsOptional()
  memo?: string;
}

export class UpdateOrderDraftItemDto {
  // itemId URL parametr sifatida keladi, shuning uchun DTO'da bo'lishi shart emas

  @IsInt()
  @Min(0)
  quantity!: number; // 0 bo'lsa, item o'chiriladi
}
