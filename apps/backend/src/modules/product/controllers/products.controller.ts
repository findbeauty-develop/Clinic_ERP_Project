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
import { CreateProductDto, CreateBatchDto } from "../dto/create-product.dto";
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
    @Tenant() tenantId: string
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
  async getAllProducts(@Tenant() tenantId: string) {
    const t0 = Date.now();
    
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    
    const t1 = Date.now();
    const result = await this.productsService.getAllProducts(tenantId);
    const t2 = Date.now();
    
    console.log(
      `[/products] auth: ${t1 - t0}ms, service: ${t2 - t1}ms, total: ${t2 - t0}ms`
    );
    
    return result;
  }

  @Get("storages/list")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get distinct storage locations for tenant" })
  getStorages(@Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.productsService.getStorages(tenantId);
  }

  @Get("warehouses/list")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get all warehouse locations with categories and items" })
  getWarehouses(@Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.productsService.getWarehouseLocations(tenantId);
  }

  @Post("warehouse")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add new warehouse location" })
  async addWarehouse(
    @Body("name") name: string,
    @Body("category") category: string,
    @Body("items") items: string[],
    @Tenant() tenantId: string
  ) {
    if (!name || !name.trim()) {
      throw new BadRequestException("창고 이름은 필수입니다");
    }
    return this.productsService.addWarehouseLocation(tenantId, name.trim(), category, items || []);
  }

  @Get(":id/batches")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get all batches for a product" })
  getProductBatches(
    @Param("id") productId: string,
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.productsService.getProductBatches(productId, tenantId);
  }

  @Post(":id/batches")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new batch for existing product" })
  createBatch(
    @Param("id") productId: string,
    @Body() dto: CreateBatchDto,
    @Tenant() tenantId: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.productsService.createBatchForProduct(productId, dto, tenantId);
  }
}
