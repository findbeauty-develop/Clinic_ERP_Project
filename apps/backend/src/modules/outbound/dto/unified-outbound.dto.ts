import {
  IsString,
  IsInt,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  IsEnum,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";

export enum OutboundType {
  PRODUCT = "제품", // 제품 출고
  PACKAGE = "패키지", // 패키지 출고
  BARCODE = "바코드", // 바코드 출고
}

export class UnifiedOutboundItemDto {
  @IsString()
  productId!: string;

  @IsString()
  batchId!: string;

  @IsInt()
  @Min(1)
  outboundQty!: number; // 출고 수량

  @IsOptional()
  @IsString()
  packageId?: string; // 패키지 ID (패키지 출고인 경우)

  @IsOptional()
  @IsInt()
  @Min(1)
  packageQty?: number; // 패키지 수량 (nechta package outbound qilingan)
}

export class UnifiedOutboundDto {
  @IsEnum(OutboundType)
  outboundType!: OutboundType; // 출고 타입: 제품, 패키지, 바코드

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

  @IsOptional()
  @IsBoolean()
  isDamaged?: boolean; // 파손 (optional)

  @IsOptional()
  @IsBoolean()
  isDefective?: boolean; // 불량 (optional)

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnifiedOutboundItemDto)
  items!: UnifiedOutboundItemDto[]; // 출고 예정 리스트
}

