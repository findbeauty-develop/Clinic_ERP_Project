import {
  Controller,
  Post,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiHeader } from "@nestjs/swagger";
import { OrderService } from "../services/order.service";
import { ApiKeyGuard } from "../../../common/guards/api-key.guard";

/**
 * Separate controller for webhook endpoints that don't require JWT
 */
@ApiTags("order-webhooks")
@Controller("order")
export class OrderWebhookController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * Supplier-backend'dan order confirmation callback
   */
  @Post("supplier-confirmed")
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: "Receive supplier order confirmation (from supplier-backend)" })
  @ApiHeader({ name: 'x-api-key', description: 'API Key for supplier-to-clinic authentication' })
  async receiveSupplierConfirmation(@Body() dto: any) {
    return this.orderService.updateOrderFromSupplier(dto);
  }
}

