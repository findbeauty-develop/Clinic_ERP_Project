import { Module } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { NotificationRecipientResolverService } from "./notification-recipient-resolver.service";
import { OrderSupplierNotifiedListener } from "./order-supplier-notified.listener";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsController } from "./notifications.controller";

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationService,
    NotificationRecipientResolverService,
    OrderSupplierNotifiedListener,
    NotificationsGateway,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
