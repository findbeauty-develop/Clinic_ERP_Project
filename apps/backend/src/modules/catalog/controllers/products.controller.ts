import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ProductsService } from "../services/products.service";
import { CreateProductDto } from "../dto/create-product.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { ReqUser } from "../../../common/decorators/req-user.decorator";

@ApiTags("catalog")
@ApiBearerAuth()
@Controller("catalog/products")
@UseGuards(JwtTenantGuard, RolesGuard)
export class ProductsController {
  constructor(private service: ProductsService) {}

  @Post()
  @ApiOperation({ summary: "Create a new product" })
  @Roles("manager", "admin")
  create(
    @Body() dto: CreateProductDto,
    @Tenant() tenantId: string,
    @ReqUser("id") userId: string
  ) {
    return this.service.create(dto, tenantId, userId);
  }

  @Get()
  @ApiOperation({ summary: "List all products" })
  @Roles("clerk", "manager", "admin")
  list(@Tenant() tenantId: string) {
    return this.service.list(tenantId);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update a product" })
  @Roles("manager", "admin")
  update(
    @Param("id") id: string,
    @Body() dto: Partial<CreateProductDto>,
    @Tenant() tenantId: string
  ) {
    return this.service.update(id, dto, tenantId);
  }
}

