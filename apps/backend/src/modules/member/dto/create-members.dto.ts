import { IsString } from "class-validator";

export class CreateMembersDto {
  @IsString()
  clinicName!: string;

  @IsString()
  ownerPassword!: string;
}

