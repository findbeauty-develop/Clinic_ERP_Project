import {
  Body,
  Controller,
  Post,
  UseGuards,
  BadRequestException,
  Get,
  Param,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import { CreateOutboundDto, BulkOutboundDto } from "../dto/create-outbound.dto";
import { OutboundService } from "../services/outbound.service";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { Tenant } from "../../../common/decorators/tenant.decorator";

@ApiTags("outbound")
@Controller("outbound")
export class OutboundController {
  constructor(private readonly outboundService: OutboundService) {}

  @Get("products")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get all products with batches for outbound processing (FEFO sorted)" })
  getProductsForOutbound(@Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.getProductsForOutbound(tenantId);
  }

  @Post()
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a single outbound transaction" })
  createOutbound(@Body() dto: CreateOutboundDto, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.createOutbound(dto, tenantId);
  }

  @Post("bulk")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create multiple outbound transactions at once" })
  createBulkOutbound(@Body() dto: BulkOutboundDto, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.createBulkOutbound(dto, tenantId);
  }

  @Get("history")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get outbound history with filters" })
  @ApiQuery({ name: "startDate", required: false, type: String })
  @ApiQuery({ name: "endDate", required: false, type: String })
  @ApiQuery({ name: "productId", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  getOutboundHistory(
    @Tenant() tenantId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("productId") productId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }

    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (productId) filters.productId = productId;
    if (page) filters.page = parseInt(page, 10);
    if (limit) filters.limit = parseInt(limit, 10);

    return this.outboundService.getOutboundHistory(tenantId, filters);
  }

  @Get(":id")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get a single outbound transaction details" })
  getOutbound(@Param("id") id: string, @Tenant() tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("Tenant ID is required");
    }
    return this.outboundService.getOutbound(id, tenantId);
  }
}

