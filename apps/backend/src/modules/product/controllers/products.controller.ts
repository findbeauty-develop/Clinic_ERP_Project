import {
  Body,
  Controller,
  Post,
  UseGuards,
  BadRequestException,
  Get,
  Param,
  Put,
  Delete,
} from "@nestjs/common";
import { ApiOperation, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { CreateProductDto } from "../dto/create-product.dto";
import { ProductsService } from "../services/products.service";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { UpdateProductDto } from "../dto/update-product.dto";

@ApiTags("products")
@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new product" })
  create(@Body() dto: CreateProductDto, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.productsService.createProduct(dto, tenantId);
  }

  @Get(":id")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get product details" })
  getProduct(@Param("id") id: string, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.productsService.getProduct(id, tenantId);
  }

  @Put(":id")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update an existing product" })
  updateProduct(
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
    @Tenant() tenantId: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.productsService.updateProduct(id, dto, tenantId);
  }

  @Delete(":id")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete a product" })
  deleteProduct(@Param("id") id: string, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.productsService.deleteProduct(id, tenantId);
  }

  @Get()
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List all products for current tenant" })
  getAllProducts(@Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.productsService.getAllProducts(tenantId);
  }
}

