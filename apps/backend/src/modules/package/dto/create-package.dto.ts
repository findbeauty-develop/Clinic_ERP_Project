import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class CreatePackageItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number; // 패키지당 제품 수량

  @IsOptional()
  @IsInt()
  order?: number; // 표시 순서
}

export class CreatePackageDto {
  @IsString()
  name!: string; // 패키지명

  @IsOptional()
  @IsString()
  description?: string; // 설명

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePackageItemDto)
  items!: CreatePackageItemDto[]; // 구성 제품들
}
