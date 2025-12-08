import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { OrderReturnService } from "./order-return.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
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

  @Post(":id/process")
  @ApiOperation({ summary: "Process a return" })
  async processReturn(
    @Tenant() tenantId: string,
    @Param("id") id: string,
    @Body() dto: any
  ) {
    return this.service.processReturn(tenantId, id, dto);
  }
}

