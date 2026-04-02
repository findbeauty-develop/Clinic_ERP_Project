import { Module } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { NotificationRecipientResolverService } from "./notification-recipient-resolver.service";
import { OrderSupplierNotifiedListener } from "./order-supplier-notified.listener";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsController } from "./notifications.controller";
import { ReturnSupplierNotifiedListener } from "./return-supplier-notified.listener";

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    NotificationRecipientResolverService,
    OrderSupplierNotifiedListener,
    ReturnSupplierNotifiedListener,
    NotificationsGateway,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
