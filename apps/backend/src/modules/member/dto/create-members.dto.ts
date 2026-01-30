import { IsBoolean, IsOptional, IsString } from "class-validator";

export class CreateMembersDto {
  @IsString()
  clinicName!: string;

  @IsString()
  ownerPassword!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsString()
  ownerName!: string;

  @IsString()
  ownerPhoneNumber!: string;

  @IsOptional()
  @IsString()
  ownerEmail?: string;

  @IsString()
  ownerIdCardNumber!: string;

  @IsString()
  ownerAddress!: string;

  @IsOptional()
  @IsString()
  clinicEnglishName?: string;

  @IsOptional()
  @IsString()
  clinicId?: string;

  @IsOptional()
  @IsBoolean()
  isEditMode?: boolean;
}
