import { IsIn, IsOptional, IsString } from "class-validator";

export class UpdateOrderStatusDto {
  @IsString()
  @IsIn(["pending", "confirmed", "rejected", "shipped", "completed"])
  status!: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

