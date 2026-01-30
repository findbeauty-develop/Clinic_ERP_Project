import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsEmail, Matches, IsIn } from "class-validator";

// Job titles enum
const JOB_TITLES = ["사원", "주임", "대리", "과장", "차장", "부장"] as const;

export class CreateSupplierManualDto {
  @ApiProperty({
    description: "회사명 (Company name)",
    example: "ABC 제약회사",
  })
  @IsString()
  companyName!: string;

  @ApiProperty({
    description: "사업자 등록번호 (Business registration number)",
    example: "123-45-67890",
  })
  @IsString()
  @Matches(/^\d{3}-\d{2}-\d{5}$/, {
    message: "사업자 등록번호 형식이 올바르지 않습니다 (예: 123-45-67890)",
  })
  businessNumber!: string;

  @ApiProperty({
    description: "회사 전화번호 (Company phone number)",
    example: "02-1234-5678",
    required: false,
  })
  @IsString()
  @IsOptional()
  companyPhone?: string;

  @ApiProperty({
    description: "회사 이메일 (Company email)",
    example: "info@company.com",
    required: false,
  })
  @IsEmail()
  @IsOptional()
  companyEmail?: string;

  @ApiProperty({
    description: "회사 주소 (Company address)",
    example: "서울시 강남구",
    required: false,
  })
  @IsString()
  @IsOptional()
  companyAddress?: string;

  @ApiProperty({
    description: "담당자 이름 (Manager name)",
    example: "홍길동",
    required: false,
  })
  @IsString()
  @IsOptional()
  managerName?: string;

  @ApiProperty({
    description: "담당자 핸드폰 번호 (Manager phone number)",
    example: "01012345678",
    required: false,
  })
  @IsString()
  @IsOptional()
  @Matches(/^010\d{8}$/, {
    message: "휴대폰 번호 형식이 올바르지 않습니다 (예: 01012345678)",
  })
  phoneNumber?: string;

  @ApiProperty({
    description: "담당자 이메일 (Manager email)",
    example: "manager@company.com",
    required: false,
  })
  @IsEmail()
  @IsOptional()
  managerEmail?: string;

  @ApiProperty({
    description: "담당자 직함 (Manager position)",
    example: "과장",
    enum: JOB_TITLES,
    required: false,
  })
  @IsString()
  @IsOptional()
  @IsIn(JOB_TITLES, {
    message: "직함은 사원, 주임, 대리, 과장, 차장, 부장 중 하나여야 합니다",
  })
  position?: string;

  @ApiProperty({
    description: "담당 제품 (Responsible products - comma separated)",
    example: "시럽, 주사기, 마스크",
    required: false,
  })
  @IsString()
  @IsOptional()
  responsibleProducts?: string;

  @ApiProperty({
    description: "메모 (Memo)",
    example: "주요 거래처",
    required: false,
  })
  @IsString()
  @IsOptional()
  memo?: string;
}
