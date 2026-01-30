import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export class PackageOutboundItemDto {
  @IsString()
  productId!: string;

  @IsString()
  batchId!: string;

  @IsInt()
  @Min(1)
  outboundQty!: number; // 출고 수량
}

export class PackageOutboundDto {
  @IsString()
  packageId!: string; // 선택한 패키지 ID

  @IsString()
  managerName!: string; // 담당자

  @IsOptional()
  @IsString()
  patientName?: string; // 환자 이름 (optional)

  @IsOptional()
  @IsString()
  chartNumber?: string; // 차트번호 (optional)

  @IsOptional()
  @IsString()
  memo?: string; // 메모 (optional)

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageOutboundItemDto)
  items!: PackageOutboundItemDto[]; // 각 구성품의 출고 수량
}
