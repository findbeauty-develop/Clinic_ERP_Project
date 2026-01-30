import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  IsArray,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateReturnItemDto {
  @IsString()
  productId!: string;

  @IsString()
  batchId!: string;

  @IsString()
  outboundId!: string; // Qaysi outbound'dan qaytarilayotgani

  @IsInt()
  @Min(1)
  returnQty!: number; // 반납 수량
}

export class CreateReturnDto {
  @IsString()
  managerName!: string; // 반납 담당자

  @IsOptional()
  @IsString()
  memo?: string; // 메모

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items!: CreateReturnItemDto[]; // 반납할 제품 목록
}
