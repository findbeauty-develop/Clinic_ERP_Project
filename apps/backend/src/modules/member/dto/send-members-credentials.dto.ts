import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class MemberCredentialDto {
  @IsString()
  memberId!: string;

  @IsString()
  role!: string;

  @IsString()
  temporaryPassword!: string;
}

export class SendMembersCredentialsDto {
  @IsString()
  ownerPhoneNumber!: string;

  @IsString()
  clinicName!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemberCredentialDto)
  members!: MemberCredentialDto[];
}

