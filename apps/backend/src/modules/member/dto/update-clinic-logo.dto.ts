import { IsNotEmpty, IsString } from "class-validator";

export class UpdateClinicLogoDto {
  @IsString()
  @IsNotEmpty()
  logoUrl!: string;
}
