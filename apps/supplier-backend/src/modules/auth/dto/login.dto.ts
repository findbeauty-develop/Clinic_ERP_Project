import { IsString, MinLength, ValidateIf, IsOptional, IsNotEmpty, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({
    example: "supplier@example.com",
    description: "Supplier email address (if using email login)",
    required: false,
  })
  @IsOptional()
  @IsString({ message: "이메일을 입력하세요" })
  email?: string;

  @ApiProperty({
    example: "한국합금+1234",
    description: "Manager ID (if using managerId login)",
    required: false,
  })
  @IsOptional()
  @IsString({ message: "담당자 ID를 입력하세요" })
  managerId?: string;

  @ApiProperty({
    example: "password123",
    description: "Supplier password",
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: "비밀번호는 최소 6자 이상이어야 합니다" })
  password!: string;

  @ApiProperty({
    example: "01012345678",
    description: "Supplier phone number",
    required: true,
    minLength: 10,
    maxLength: 11,
  })
  @IsString()
  @IsNotEmpty({ message: "휴대폰 번호를 입력하세요" })
  @Matches(/^010[0-9]{8}$/, { message: "올바른 휴대폰 번호 형식이 아닙니다 예: 01012345678" })
  phoneNumber!: string;
}

