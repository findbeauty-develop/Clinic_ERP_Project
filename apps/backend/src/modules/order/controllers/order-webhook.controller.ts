import { Controller, Post, Body, UseGuards, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiHeader } from "@nestjs/swagger";
import { OrderService } from "../services/order.service";
import { ApiKeyGuard } from "../../../common/guards/api-key.guard";

/**
 * Separate controller for webhook endpoints that don't require JWT
 */
@ApiTags("order-webhooks")
@Controller("order")
export class OrderWebhookController {
  private readonly logger = new Logger(OrderWebhookController.name);

  constructor(private readonly orderService: OrderService) {}

  /**
   * Supplier-backend'dan order confirmation callback
   */
  @Post("supplier-confirmed")
  @UseGuards(ApiKeyGuard)
  @ApiOperation({
    summary: "Receive supplier order confirmation (from supplier-backend)",
  })
  @ApiHeader({
    name: "x-api-key",
    description: "API Key for supplier-to-clinic authentication",
  })
  async receiveSupplierConfirmation(@Body() dto: any) {
    this.logger.log(
      `📬 [Webhook] Received supplier confirmation request for order ${dto.orderNo}`
    );
    try {
      const result = await this.orderService.updateOrderFromSupplier(dto);
      this.logger.log(
        `✅ [Webhook] Successfully processed supplier confirmation for order ${dto.orderNo}`
      );
      return result;
    } catch (error: any) {
      this.logger.error(
        `❌ [Webhook] Error processing supplier confirmation: ${error.message}`
      );
      throw error;
    }
  }
}
