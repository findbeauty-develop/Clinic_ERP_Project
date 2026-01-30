import { IsString, IsNotEmpty, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class RejectedOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productName!: string;

  @IsString()
  productBrand?: string;

  @IsNotEmpty()
  qty!: number;
}

export class ConfirmRejectedOrderDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  orderNo!: string;

  // ✅ Removed: companyName and managerName - backend will fetch from database

  @IsString()
  @IsNotEmpty()
  memberName!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RejectedOrderItemDto)
  items!: RejectedOrderItemDto[];
}
