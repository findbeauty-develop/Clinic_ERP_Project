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
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { OrderService, ProductWithRisk } from "../services/order.service";
import { CreateOrderDto } from "../dto/create-order.dto";
import {
  UpdateOrderDraftDto,
  AddOrderDraftItemDto,
  UpdateOrderDraftItemDto,
} from "../dto/update-order-draft.dto";
import { OrderProductsQueryDto } from "../dto/order-products-query.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { ReqUser } from "../../../common/decorators/req-user.decorator";

@ApiTags("order")
@ApiBearerAuth()
@Controller("order")
@UseGuards(JwtTenantGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * 주문 처리용 제품 목록 (Risk score bilan)
   */
  @Get("products")
  @ApiOperation({ summary: "Get products for order with risk score calculation" })
  async getProductsForOrder(
    @Tenant() tenantId: string,
    @Query() query: OrderProductsQueryDto
  ): Promise<ProductWithRisk[]> {
    return this.orderService.getProductsForOrder(tenantId, query);
  }

  /**
   * Order draft'ni olish yoki yaratish
   */
  @Get("draft")
  @ApiOperation({ summary: "Get or create order draft" })
  async getDraft(
    @Tenant() tenantId: string,
    @Req() req: any
  ) {
    // Session ID olish (frontend'dan header yoki query param orqali)
    const sessionId = req.headers["x-session-id"] || req.query.sessionId || req.user?.id || "default";
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
    const sessionId = req.headers["x-session-id"] || req.query.sessionId || req.user?.id || "default";
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
    const sessionId = req.headers["x-session-id"] || req.query.sessionId || req.user?.id || "default";
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
    const sessionId = req.headers["x-session-id"] || req.query.sessionId || req.user?.id || "default";
    return this.orderService.updateDraft(sessionId, tenantId, dto);
  }

  /**
   * Order draft'ni o'chirish
   */
  @Delete("draft")
  @ApiOperation({ summary: "Delete order draft" })
  async deleteDraft(
    @Tenant() tenantId: string,
    @Req() req: any
  ) {
    const sessionId = req.headers["x-session-id"] || req.query.sessionId || req.user?.id || "default";
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
    const sessionId = req.headers["x-session-id"] || req.query.sessionId || userId || "default";
    return this.orderService.createOrder(sessionId, tenantId, dto, userId);
  }

  /**
   * Order'lar ro'yxatini olish
   */
  @Get()
  @ApiOperation({ summary: "Get all orders" })
  async getOrders(@Tenant() tenantId: string) {
    // Implementation will be added
    return { message: "Not implemented yet" };
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
}

