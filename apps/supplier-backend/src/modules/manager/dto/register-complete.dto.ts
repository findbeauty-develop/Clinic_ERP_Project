import { IsString, IsNotEmpty, IsOptional, IsObject, ValidateNested, IsIn } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export const JOB_TITLES = ["사원", "주임", "대리", "과장", "차장", "부장"] as const;
export type JobTitle = typeof JOB_TITLES[number];

class ManagerDataDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  certificateImageUrl?: string;

  @ApiProperty({
    enum: JOB_TITLES,
    description: "직함 (Job Title): 사원, 주임, 대리, 과장, 차장, 부장",
    required: false,
    example: "대리",
  })
  @IsString()
  @IsOptional()
  @IsIn(JOB_TITLES, { message: "직함은 사원, 주임, 대리, 과장, 차장, 부장 중 하나여야 합니다" })
  position?: JobTitle;
}

class CompanyDataDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  businessNumber!: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  companyPhone?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  companyEmail!: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  companyAddress?: string;

  @ApiProperty()
  @IsString({ each: true })
  @IsOptional()
  productCategories?: string[];

  @ApiProperty()
  @IsOptional()
  shareConsent?: boolean;
}

class ContactDataDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  email1!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  managerAddress!: string;

  @ApiProperty()
  @IsString({ each: true })
  @IsNotEmpty()
  responsibleProducts!: string[];
}

export class RegisterCompleteDto {
  @ApiProperty({ type: ManagerDataDto })
  @ValidateNested()
  @Type(() => ManagerDataDto)
  manager!: ManagerDataDto;

  @ApiProperty({ type: CompanyDataDto })
  @ValidateNested()
  @Type(() => CompanyDataDto)
  company!: CompanyDataDto;

  @ApiProperty({ type: ContactDataDto })
  @ValidateNested()
  @Type(() => ContactDataDto)
  contact!: ContactDataDto;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  managerId!: string;
}

