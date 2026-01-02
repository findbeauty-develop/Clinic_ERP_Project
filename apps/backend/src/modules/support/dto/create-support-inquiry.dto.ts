import { IsString, IsNotEmpty, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateSupportInquiryDto {
  @ApiProperty({ description: "문의자 이름", example: "홍길동" })
  @IsString()
  @IsNotEmpty()
  memberName!: string;

  @ApiProperty({ description: "병의원 이름", example: "서울병원" })
  @IsString()
  @IsNotEmpty()
  clinicName!: string;

  @ApiProperty({ description: "연락처", example: "010-1234-5678" })
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @ApiProperty({
    description: "문의 내용 (최대 500자)",
    example: "계정 오류 문의입니다.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  inquiry!: string;
}
