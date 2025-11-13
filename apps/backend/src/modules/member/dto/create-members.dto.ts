import { IsOptional, IsString } from "class-validator";

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

  @IsString()
  ownerIdCardNumber!: string;

  @IsString()
  ownerAddress!: string;
}

