import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsArray,
  ArrayMinSize,
  MinLength,
  Matches,
  ValidateIf,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RegisterContactDto {
  @ApiProperty({
    example: "SecurePass123!",
    description: "Password (minimum 9 characters, alphanumeric)",
  })
  @IsString()
  @IsNotEmpty({ message: "비밀번호를 입력하세요" })
  @MinLength(9, { message: "비밀번호는 최소 9자 이상이어야 합니다" })
  @Matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/, {
    message: "비밀번호는 영문과 숫자를 포함해야 합니다",
  })
  password!: string;

  @ApiProperty({
    example: "SecurePass123!",
    description: "Password confirmation",
  })
  @IsString()
  @IsNotEmpty({ message: "비밀번호 확인을 입력하세요" })
  passwordConfirm!: string;

  @ApiProperty({
    example: "contact1@example.com",
    description: "Primary email address",
  })
  @IsString()
  @IsEmail({}, { message: "올바른 이메일 형식이 아닙니다" })
  @IsNotEmpty({ message: "이메일을 입력하세요" })
  email1!: string;

  @ApiProperty({
    example: "contact2@example.com",
    description: "Secondary email address (optional)",
    required: false,
  })
  @ValidateIf((o) => o.email2 && o.email2.length > 0)
  @IsEmail({}, { message: "올바른 이메일 형식이 아닙니다" })
  email2?: string;

  @ApiProperty({
    example: ["서울", "경기", "인천"],
    description: "Responsible regions list",
  })
  @IsArray()
  @ArrayMinSize(1, { message: "최소 1개 이상의 담당 지역을 선택하세요" })
  @IsString({ each: true })
  responsibleRegions!: string[];

  @ApiProperty({
    example: ["의료기기", "주사 재료", "코스메슈티컬"],
    description: "Responsible products list",
  })
  @IsArray()
  @ArrayMinSize(1, { message: "최소 1개 이상의 담당 제품을 선택하세요" })
  @IsString({ each: true })
  responsibleProducts!: string[];

  // Step 2 and Step 3 data
  @ApiProperty({
    description: "Previous step data",
    required: false,
  })
  @ValidateIf(() => false) // Don't validate, just accept
  step2Data?: any;

  @ApiProperty({
    description: "Previous step data",
    required: false,
  })
  @ValidateIf(() => false) // Don't validate, just accept
  step3Data?: any;
}

