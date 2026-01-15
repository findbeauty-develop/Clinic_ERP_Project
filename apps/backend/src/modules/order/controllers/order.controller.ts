import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  SetMetadata,
  Req,
  Header,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
} from "@nestjs/swagger";
import { OrderService } from "../services/order.service";
import { CreateOrderDto } from "../dto/create-order.dto";
import {
  UpdateOrderDraftDto,
  AddOrderDraftItemDto,
  UpdateOrderDraftItemDto,
} from "../dto/update-order-draft.dto";
import { SearchProductsQueryDto } from "../dto/search-products-query.dto";
import { ConfirmRejectedOrderDto } from "../dto/confirm-rejected-order.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { ApiKeyGuard } from "../../../common/guards/api-key.guard";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { ReqUser } from "../../../common/decorators/req-user.decorator";

@ApiTags("order")
@ApiBearerAuth()
@Controller("order")
@UseGuards(JwtTenantGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * 주문 처리용 제품 목록 (모든 제품 반환, frontend에서 sorting/filtering)
   */
  @Get("products")
  @Header("Cache-Control", "public, max-age=30")
  @ApiOperation({
    summary: "Get all products for order - filtering done on frontend",
  })
  async getProductsForOrder(@Tenant() tenantId: string): Promise<any[]> {
    return this.orderService.getProductsForOrder(tenantId);
  }

  /**
   * 기타제품 주문용 제품 검색 (Pagination bilan, risk score bo'lmasa ham)
   */
  @Get("products/search")
  @ApiOperation({
    summary: "Search products for additional order (with pagination)",
  })
  async searchProducts(
    @Tenant() tenantId: string,
    @Query() query: SearchProductsQueryDto
  ) {
    return this.orderService.searchProducts(tenantId, query);
  }

  /**
   * Order draft'ni olish yoki yaratish
   */
  @Get("draft")
  @ApiOperation({ summary: "Get or create order draft" })
  async getDraft(@Tenant() tenantId: string, @Req() req: any) {
    // Session ID olish (frontend'dan header yoki query param orqali)
    const sessionId =
      req.headers["x-session-id"] ||
      req.query.sessionId ||
      req.user?.id ||
      "default";
    return this.orderService.getOrCreateDraft(sessionId, tenantId);
  }

  /**
   * Order draft'ga item qo'shish
   */
  @Post("draft/items")
  @ApiOperation({ summary: "Add item to order draft" })
  async addDraftItem(
    @Tenant() tenantId: string,
    @Body() dto: AddOrderDraftItemDto,
    @Req() req: any
  ) {
    const sessionId =
      req.headers["x-session-id"] ||
      req.query.sessionId ||
      req.user?.id ||
      "default";
    return this.orderService.addDraftItem(sessionId, tenantId, dto);
  }

  /**
   * Order draft'dan item'ni yangilash yoki o'chirish
   */
  @Put("draft/items/:itemId")
  @ApiOperation({ summary: "Update or remove item from order draft" })
  async updateDraftItem(
    @Tenant() tenantId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateOrderDraftItemDto,
    @Req() req: any
  ) {
    const sessionId =
      req.headers["x-session-id"] ||
      req.query.sessionId ||
      req.user?.id ||
      "default";
    return this.orderService.updateDraftItem(sessionId, tenantId, itemId, dto);
  }

  /**
   * Order draft'ni to'liq yangilash
   */
  @Put("draft")
  @ApiOperation({ summary: "Update entire order draft" })
  async updateDraft(
    @Tenant() tenantId: string,
    @Body() dto: UpdateOrderDraftDto,
    @Req() req: any
  ) {
    const sessionId =
      req.headers["x-session-id"] ||
      req.query.sessionId ||
      req.user?.id ||
      "default";
    return this.orderService.updateDraft(sessionId, tenantId, dto);
  }

  /**
   * Order draft'ni o'chirish
   */
  @Delete("draft")
  @ApiOperation({ summary: "Delete order draft" })
  async deleteDraft(@Tenant() tenantId: string, @Req() req: any) {
    const sessionId =
      req.headers["x-session-id"] ||
      req.query.sessionId ||
      req.user?.id ||
      "default";
    // Delete logic will be added to service
    return { success: true };
  }

  /**
   * Order yaratish (draft'dan)
   */
  @Post()
  @ApiOperation({ summary: "Create order from draft" })
  async createOrder(
    @Tenant() tenantId: string,
    @Body() dto: CreateOrderDto,
    @ReqUser("id") userId: string,
    @Req() req: any
  ) {
    const sessionId =
      req.headers["x-session-id"] || req.query.sessionId || userId || "default";
    return this.orderService.createOrder(sessionId, tenantId, dto, userId);
  }

  /**
   * Order'lar ro'yxatini olish
   */
  @Get()
  @ApiOperation({ summary: "Get all orders" })
  async getOrders(
    @Tenant() tenantId: string,
    @Query("search") search?: string
  ) {
    return this.orderService.getOrders(tenantId, search);
  }

  /**
   * Get pending inbound orders (supplier confirmed, ready for inbound)
   * Must come before :id route to avoid route conflicts
   */
  @Get("pending-inbound")
  @UseGuards(JwtTenantGuard)
  @Header("Cache-Control", "public, max-age=30")
  @ApiOperation({
    summary: "Get orders ready for inbound (supplier confirmed)",
  })
  async getPendingInbound(@Tenant() tenantId: string) {
    return this.orderService.getPendingInboundOrders(tenantId);
  }

  /**
   * Get rejected orders for order history
   * NOTE: This route must come BEFORE @Get(":id") to avoid route conflicts
   */
  @Get("rejected-orders")
  @UseGuards(JwtTenantGuard)
  @ApiOperation({ summary: "Get rejected orders" })
  async getRejectedOrders(@Tenant() tenantId: string) {
    return this.orderService.getRejectedOrders(tenantId);
  }

  /**
   * Confirm rejected order - create RejectedOrder records
   */
  @Post("rejected-order/confirm")
  @UseGuards(JwtTenantGuard)
  @ApiOperation({ summary: "Confirm rejected order" })
  async confirmRejectedOrder(
    @Tenant() tenantId: string,
    @Body() dto: ConfirmRejectedOrderDto
  ) {
    return this.orderService.confirmRejectedOrder(tenantId, dto);
  }

  /**
   * Order'ni olish
   */
  @Get(":id")
  @ApiOperation({ summary: "Get order by ID" })
  async getOrder(@Tenant() tenantId: string, @Param("id") id: string) {
    // Implementation will be added
    return { message: "Not implemented yet" };
  }

  /**
   * Cancel order - Clinic initiates cancellation
   */
  @Put(":id/cancel")
  @UseGuards(JwtTenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "주문 취소 (Clinic initiates order cancellation)" })
  async cancelOrder(@Tenant() tenantId: string, @Param("id") id: string) {
    return this.orderService.cancelOrder(id, tenantId);
  }

  /**
   * Mark order as completed after inbound processing
   */
  @Post(":id/complete")
  @UseGuards(JwtTenantGuard)
  @ApiOperation({ summary: "Mark order as completed after inbound processing" })
  async completeOrder(@Tenant() tenantId: string, @Param("id") id: string) {
    return this.orderService.completeOrder(id, tenantId);
  }

  /**
   * Delete order
   */
  @Delete(":id")
  @UseGuards(JwtTenantGuard)
  @ApiOperation({ summary: "Delete order" })
  async deleteOrder(@Tenant() tenantId: string, @Param("id") id: string) {
    return this.orderService.deleteOrder(id, tenantId);
  }

  /**
   * Webhook: Order split notification from supplier-backend
   */
  @Post("order-split")
  @UseGuards(ApiKeyGuard)
  @SetMetadata("skipJwtGuard", true)
  @ApiOperation({
    summary: "Receive order split notification from supplier-backend",
  })
  @ApiHeader({ name: "x-api-key", description: "API Key for authentication" })
  async handleOrderSplit(@Body() dto: any) {
    return this.orderService.handleOrderSplit(dto);
  }
}
