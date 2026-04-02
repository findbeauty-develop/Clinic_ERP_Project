import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { RETURN_SUPPLIER_NOTIFIED_EVENT } from "./constants/notification-events";
import { ReturnSupplierNotifiedPayload } from "./types/return-supplier-notification.payload";
import { NotificationService } from "./notification.service";

@Injectable()
export class ReturnSupplierNotifiedListener {
  private readonly logger = new Logger(ReturnSupplierNotifiedListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(RETURN_SUPPLIER_NOTIFIED_EVENT, { async: true })
  async handle(payload: ReturnSupplierNotifiedPayload) {
    try {
      await this.notificationService.createFromReturnSupplierEvent(payload);
    } catch (e: any) {
      this.logger.error(
        `Return supplier notification failed: ${e?.message || e}`,
        e?.stack
      );
    }
  }
}
