import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsArray,
  IsBoolean,
  IsOptional,
  ArrayMinSize,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RegisterCompanyDto {
  @ApiProperty({
    example: "예시 회사",
    description: "Company name",
  })
  @IsString()
  @IsNotEmpty({ message: "회사명을 입력하세요" })
  companyName!: string;

  @ApiProperty({
    example: "123-45-67890",
    description: "Business registration number",
  })
  @IsString()
  @IsNotEmpty({ message: "사업자 등록번호를 입력하세요" })
  businessNumber!: string;

  @ApiProperty({
    example: "02-1234-5678",
    description: "Company phone number",
  })
  @IsString()
  @IsNotEmpty({ message: "회사 전화번호를 입력하세요" })
  companyPhone!: string;

  @ApiProperty({
    example: "company@example.com",
    description: "Company email address",
  })
  @IsString()
  @IsEmail({}, { message: "올바른 이메일 형식이 아닙니다" })
  @IsNotEmpty({ message: "회사 이메일 주소를 입력하세요" })
  companyEmail!: string;

  @ApiProperty({
    example: "서울시 강남구 테헤란로 123",
    description: "Company address",
    required: false,
  })
  @IsString()
  @IsOptional()
  companyAddress?: string;

  @ApiProperty({
    example: ["cosmeceutical", "injection", "medical_device"],
    description: "Product categories",
  })
  @IsArray()
  @ArrayMinSize(1, { message: "최소 1개 이상의 제품 카테고리를 선택하세요" })
  @IsString({ each: true })
  productCategories!: string[];

  @ApiProperty({
    example: true,
    description: "Consent to share company information",
  })
  @IsBoolean()
  shareConsent!: boolean;

  // Step 2 data (manager info)
  @ApiProperty({
    example: {
      name: "홍길동",
      phoneNumber: "01012345678",
      certificateUrl: "/uploads/supplier/certificate/image.jpg",
    },
    description: "Manager registration data from step 2",
  })
  @IsOptional()
  step2Data?: {
    name: string;
    phoneNumber: string;
    certificateUrl: string;
  };
}

