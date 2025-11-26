import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsOptional, IsEmail, Matches } from "class-validator";

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
}

