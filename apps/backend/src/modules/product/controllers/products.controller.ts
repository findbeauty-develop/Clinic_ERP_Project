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
  Header,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { ApiOperation, ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { CreateProductDto, CreateBatchDto } from "../dto/create-product.dto";
import { PreviewImportDto, ConfirmImportDto } from "../dto/import-products.dto";
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
  @Header("Cache-Control", "public, max-age=30")
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
  @Header("Cache-Control", "public, max-age=30")
  async getAllProducts(@Tenant() tenantId: string, @Res() res: Response) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const t0 = Date.now();
    const products = await this.productsService.getAllProducts(tenantId);
    const t1 = Date.now();

    // ETag yaratish (cache timestamp asosida)
    const cacheTimestamp = this.productsService.getCacheTimestamp(tenantId);
    const etag = `"${Buffer.from(`${tenantId}-${cacheTimestamp}`)
      .toString("base64")
      .substring(0, 16)}"`;

    // If-None-Match tekshirish - AGAR ETag mos kelsa, 304 qaytarish
    const ifNoneMatch = res.req.headers["if-none-match"];
    if (ifNoneMatch === etag) {
      return res.status(304).end();
    }

    // ETag header'ni qo'shish
    res.setHeader("ETag", etag);
    return res.json(products);
  }

  @Get("storages/list")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get distinct storage locations for tenant" })
  @Header("Cache-Control", "public, max-age=60")
  getStorages(@Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.productsService.getStorages(tenantId);
  }

  @Get("warehouses/list")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get all warehouse locations with categories and items",
  })
  @Header("Cache-Control", "public, max-age=60")
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
    return this.productsService.addWarehouseLocation(
      tenantId,
      name.trim(),
      category,
      items || []
    );
  }

  @Get(":id/batches")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get all batches for a product" })
  @Header("Cache-Control", "public, max-age=30")
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

  @Post("import/preview")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "CSV Import Preview - Validate data before importing",
    description:
      "Validates CSV data and returns preview with errors. Does not modify database.",
  })
  async previewImport(
    @Tenant() tenantId: string,
    @Body() dto: PreviewImportDto
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Transform string values to numbers for numeric fields
    const transformedRows = dto.rows.map((row: any) => ({
      ...row,
      inbound_qty: row.inbound_qty ? Number(row.inbound_qty) : 0,
      min_stock: row.min_stock ? Number(row.min_stock) : 0,
      capacity_per_product: row.capacity_per_product
        ? Number(row.capacity_per_product)
        : 0,
      usage_capacity: row.usage_capacity ? Number(row.usage_capacity) : 0,
      alert_days: row.alert_days ? Number(row.alert_days) : 0,
      purchase_price: row.purchase_price ? Number(row.purchase_price) : null,
      sale_price: row.sale_price ? Number(row.sale_price) : null,
    }));

    return this.productsService.previewImport(tenantId, transformedRows);
  }

  @Post("import/confirm")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Confirm CSV Import - Import validated products",
    description:
      "Imports products from CSV. Supports strict (all or nothing) and flexible (valid only) modes.",
  })
  async confirmImport(
    @Tenant() tenantId: string,
    @Body()
    dto: ConfirmImportDto & {
      mode?: "strict" | "flexible";
    }
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    // Transform string values to numbers for numeric fields
    const transformedRows = dto.rows.map((row: any) => ({
      ...row,
      inbound_qty: row.inbound_qty ? Number(row.inbound_qty) : 0,
      min_stock: row.min_stock ? Number(row.min_stock) : 0,
      capacity_per_product: row.capacity_per_product
        ? Number(row.capacity_per_product)
        : 0,
      usage_capacity: row.usage_capacity ? Number(row.usage_capacity) : 0,
      alert_days: row.alert_days ? Number(row.alert_days) : 0,
      purchase_price: row.purchase_price ? Number(row.purchase_price) : null,
      sale_price: row.sale_price ? Number(row.sale_price) : null,
    }));

    return this.productsService.confirmImport(
      tenantId,
      transformedRows,
      dto.mode || "strict"
    );
  }
}
