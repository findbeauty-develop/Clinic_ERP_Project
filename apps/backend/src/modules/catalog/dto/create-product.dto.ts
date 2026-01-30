import { IsString, IsOptional } from "class-validator";

export class CreateProductDto {
  @IsString() sku!: string;
  @IsString() name!: string;
  @IsString() uom!: string;
  @IsOptional() @IsString() barcode?: string;
}
