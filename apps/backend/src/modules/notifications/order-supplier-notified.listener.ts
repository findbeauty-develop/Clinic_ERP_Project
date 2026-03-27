import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { ORDER_SUPPLIER_NOTIFIED_EVENT } from "./constants/notification-events";
import type { OrderSupplierNotifiedPayload } from "./types/order-supplier-notified.payload";
import { NotificationService } from "./notification.service";

@Injectable()
export class OrderSupplierNotifiedListener {
  private readonly logger = new Logger(OrderSupplierNotifiedListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(ORDER_SUPPLIER_NOTIFIED_EVENT, { async: true })
  async handle(payload: OrderSupplierNotifiedPayload) {
    try {
      await this.notificationService.createFromOrderSupplierEvent(payload);
    } catch (e: any) {
      this.logger.error(
        `Order supplier notification failed: ${e?.message || e}`,
        e?.stack
      );
    }
  }
}
