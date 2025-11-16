import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  IsArray,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateOutboundDto {
  @IsString()
  productId!: string;

  @IsString()
  batchId!: string;

  @IsInt()
  @Min(1)
  outboundQty!: number; // 출고 수량

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
}

export class BulkOutboundDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOutboundDto)
  items!: CreateOutboundDto[];
}

