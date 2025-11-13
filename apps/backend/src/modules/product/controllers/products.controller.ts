import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CreateProductDto } from "../dto/create-product.dto";
import { ProductsService } from "../services/products.service";

@ApiTags("products")
@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: "Create a new product" })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.createProduct(dto);
  }
}

