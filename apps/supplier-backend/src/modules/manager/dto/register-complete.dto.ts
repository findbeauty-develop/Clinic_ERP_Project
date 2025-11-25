import { IsString, IsNotEmpty, IsOptional, IsObject, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

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
  @IsString()
  @IsOptional()
  businessType?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  businessItem?: string;

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
  @IsOptional()
  email2?: string;

  @ApiProperty()
  @IsString({ each: true })
  @IsNotEmpty()
  responsibleRegions!: string[];

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

