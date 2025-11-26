import { IsString, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SearchSupplierDto {
  @ApiProperty({
    description: "회사명 (Company name) - Optional",
    required: false,
    example: "뷰티재고",
  })
  @IsString()
  @IsOptional()
  companyName?: string;

  @ApiProperty({
    description: "담당자 핸드폰 번호 (Manager phone number) - Optional",
    required: false,
    example: "01012345678",
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}

