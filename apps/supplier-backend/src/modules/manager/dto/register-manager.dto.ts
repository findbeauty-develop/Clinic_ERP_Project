import { IsString, IsNotEmpty, Matches, MinLength, MaxLength, IsOptional, IsIn } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

const JOB_TITLES = ["사원", "주임", "대리", "과장", "차장", "부장"] as const;

export class RegisterManagerDto {
  @ApiProperty({
    example: "홍길동",
    description: "Manager name",
  })
  @IsString()
  @IsNotEmpty({ message: "이름을 입력하세요" })
  @MinLength(2, { message: "이름은 최소 2자 이상이어야 합니다" })
  name!: string;

  @ApiProperty({
    example: "01012345678",
    description: "Phone number (Korean format)",
  })
  @IsString()
  @IsNotEmpty({ message: "휴대폰 번호를 입력하세요" })
  @Matches(/^010\d{8}$/, {
    message: "올바른 휴대폰 번호 형식이 아닙니다 (010XXXXXXXX)",
  })
  phoneNumber!: string;

  @ApiProperty({
    example: "대리",
    description: "직함 (Job Title): 사원, 주임, 대리, 과장, 차장, 부장",
    required: false,
    enum: JOB_TITLES,
  })
  @IsString()
  @IsOptional()
  @IsIn(JOB_TITLES, { message: "직함은 사원, 주임, 대리, 과장, 차장, 부장 중 하나여야 합니다" })
  position?: string;

  @ApiProperty({
    example: "/uploads/supplier/certificate/image.jpg",
    description: "Business registration certificate image URL",
  })
  @IsString()
  @IsNotEmpty({ message: "사업자등록증 이미지를 업로드하세요" })
  certificateImageUrl!: string;
}

