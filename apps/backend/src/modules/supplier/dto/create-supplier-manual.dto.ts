import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsEmail,
  Matches,
  IsIn,
  IsUUID,
  IsNotEmpty,
  ValidateIf,
} from "class-validator";

const JOB_TITLES = [
  "사원",
  "주임",
  "대리",
  "과장",
  "차장",
  "부장",
  "대표",
  "이사",
  "담당자",
] as const;

/** Supplier.status values used for clinic-created rows */
export const MANUAL_SUPPLIER_STATUSES = ["MANUAL_ONLY", "ACTIVE"] as const;

export class CreateSupplierManualDto {
  @ApiPropertyOptional({
    description: "ClinicSupplierManager id (수정 시)",
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    description: "기존 Supplier.id — 있으면 해당 행을 갱신하고 클리닉 매니저에 연결",
  })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiProperty({ description: "회사명 (필수)" })
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @ApiPropertyOptional({
    description: "사업자 등록번호 (선택, 입력 시 123-45-67890 형식)",
    example: "123-45-67890",
  })
  @IsOptional()
  @ValidateIf(
    (o: CreateSupplierManualDto) =>
      o.businessNumber != null && String(o.businessNumber).trim() !== ""
  )
  @IsString()
  @Matches(/^\d{3}-\d{2}-\d{5}$/, {
    message: "사업자 등록번호 형식이 올바르지 않습니다 (예: 123-45-67890)",
  })
  businessNumber?: string;

  @ApiPropertyOptional({ description: "회사 전화번호" })
  @IsString()
  @IsOptional()
  companyPhone?: string;

  @ApiPropertyOptional({ description: "회사 이메일" })
  @IsEmail()
  @IsOptional()
  companyEmail?: string;

  @ApiPropertyOptional({ description: "회사 주소" })
  @IsString()
  @IsOptional()
  companyAddress?: string;

  @ApiProperty({ description: "담당자 이름 (필수)" })
  @IsString()
  @IsNotEmpty()
  managerName!: string;

  @ApiProperty({
    description: "담당자 핸드폰 (필수, 010XXXXXXXX)",
    example: "01012345678",
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^010\d{8}$/, {
    message: "휴대폰 번호 형식이 올바르지 않습니다 (예: 01012345678)",
  })
  phoneNumber!: string;

  @ApiProperty({
    description: "Supplier.status (필수)",
    enum: MANUAL_SUPPLIER_STATUSES,
    example: "MANUAL_ONLY",
  })
  @IsString()
  @IsIn([...MANUAL_SUPPLIER_STATUSES])
  status!: string;

  @ApiPropertyOptional({ description: "담당자 이메일" })
  @IsEmail()
  @IsOptional()
  managerEmail?: string;

  @ApiPropertyOptional({
    description: "담당자 직함",
    enum: JOB_TITLES,
  })
  @IsOptional()
  @ValidateIf(
    (o: CreateSupplierManualDto) =>
      o.position != null && String(o.position).trim() !== ""
  )
  @IsString()
  @IsIn(JOB_TITLES, {
    message:
      "직함은 사원, 주임, 대리, 과장, 차장, 부장, 대표, 이사, 담당자 중 하나여야 합니다",
  })
  position?: string;

  @ApiPropertyOptional({
    description: "담당 제품 (쉼표 구분)",
  })
  @IsString()
  @IsOptional()
  responsibleProducts?: string;

  @ApiPropertyOptional({ description: "메모" })
  @IsString()
  @IsOptional()
  memo?: string;
}
