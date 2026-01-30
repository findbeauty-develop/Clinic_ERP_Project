import { IsString } from "class-validator";

export class MemberLoginDto {
  @IsString()
  memberId!: string;

  @IsString()
  password!: string;
}
