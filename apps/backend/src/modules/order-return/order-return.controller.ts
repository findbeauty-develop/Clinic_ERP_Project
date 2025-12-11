import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { OrderReturnService } from "./order-return.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { ApiKeyGuard } from "../../common/guards/api-key.guard";
import { Tenant } from "../../common/decorators/tenant.decorator";

@ApiTags("order-returns")
@Controller("order-returns")
@UseGuards(JwtTenantGuard)
@ApiBearerAuth()
export class OrderReturnController {
  constructor(private readonly service: OrderReturnService) {}

  @Get()
  @ApiOperation({ summary: "Get order returns by status" })
  async getReturns(
    @Tenant() tenantId: string,
    @Query("status") status?: string
  ) {
    return this.service.getReturns(tenantId, status);
  }

  @Post("create-from-inbound")
  @ApiOperation({ summary: "Create returns from inbound excess" })
  async createFromInbound(@Tenant() tenantId: string, @Body() dto: any) {
    return this.service.createFromInbound(tenantId, dto);
  }

  @Post("create-from-outbound")
  @ApiOperation({ summary: "Create returns from outbound defective products" })
  async createFromOutbound(@Tenant() tenantId: string, @Body() dto: any) {
    return this.service.createFromOutbound(tenantId, dto);
  }

  @Post(":id/process")
  @ApiOperation({ summary: "Process a return" })
  async processReturn(
    @Tenant() tenantId: string,
    @Param("id") id: string,
    @Body() dto: any
  ) {
    return this.service.processReturn(tenantId, id, dto);
  }

  @Put(":id/return-type")
  @ApiOperation({ summary: "Update return type" })
  async updateReturnType(
    @Tenant() tenantId: string,
    @Param("id") id: string,
    @Body() dto: { return_type: string }
  ) {
    return this.service.updateReturnType(tenantId, id, dto.return_type);
  }

  @Post("webhook/complete")
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: "Webhook: Supplier'dan return completion xabari" })
  async handleReturnComplete(@Body() dto: { return_no: string; item_id?: string; status: string }) {
    return this.service.handleReturnComplete(dto);
  }

  @Put(":id/confirm-exchange")
  @ApiOperation({ summary: "Confirm exchange (교환 확인)" })
  async confirmExchange(
    @Tenant() tenantId: string,
    @Param("id") id: string
  ) {
    return this.service.confirmExchange(tenantId, id);
  }
}

