import { IsEmail, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({
    example: "supplier@example.com",
    description: "Supplier email address",
  })
  @IsEmail({}, { message: "올바른 이메일 주소를 입력하세요" })
  email!: string;

  @ApiProperty({
    example: "password123",
    description: "Supplier password",
    minLength: 6,
  })
  @IsString()
  @MinLength(6, { message: "비밀번호는 최소 6자 이상이어야 합니다" })
  password!: string;
}

