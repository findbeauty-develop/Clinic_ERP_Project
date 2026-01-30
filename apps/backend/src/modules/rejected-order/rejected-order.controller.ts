import { Controller, Post, Get, Body, UseGuards } from "@nestjs/common";
import { RejectedOrderService } from "./rejected-order.service";
import { JwtTenantGuard } from "../../common/guards/jwt-tenant.guard";
import { Tenant } from "../../common/decorators/tenant.decorator";

@Controller("rejected-order")
@UseGuards(JwtTenantGuard)
export class RejectedOrderController {
  constructor(private readonly rejectedOrderService: RejectedOrderService) {}

  @Post("confirm")
  async confirmRejection(
    @Tenant() tenantId: string,
    @Body() body: { orderId: string; memberName: string }
  ) {
    return this.rejectedOrderService.createRejectedOrder(
      tenantId,
      body.orderId,
      body.memberName
    );
  }

  @Get()
  async getRejectedOrders(@Tenant() tenantId: string) {
    return this.rejectedOrderService.getRejectedOrders(tenantId);
  }
}
