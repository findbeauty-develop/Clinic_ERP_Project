import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsInt, IsString, Min, ValidateNested } from "class-validator";

export class UnreturnedItemDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty()
  @IsString()
  batchNo!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  unreturnedQty!: number;

  @ApiProperty()
  @IsString()
  reason!: string;
}

export class PartialReturnAcceptanceDto {
  @ApiProperty()
  @IsString()
  returnId!: string;

  @ApiProperty()
  @IsString()
  clinicTenantId!: string;

  @ApiProperty({ type: [UnreturnedItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnreturnedItemDto)
  unreturnedItems!: UnreturnedItemDto[];
}
