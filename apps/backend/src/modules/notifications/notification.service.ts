import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma.service";
import { NotificationType } from "../../../node_modules/.prisma/client-backend";
import { NotificationRecipientResolverService } from "./notification-recipient-resolver.service";
import { NotificationsGateway } from "./notifications.gateway";
import { toNotificationItemDto } from "./notification.mapper";
import type { OrderSupplierNotifiedPayload } from "./types/order-supplier-notified.payload";
import { ReturnSupplierNotifiedPayload } from "./types/return-supplier-notification.payload";

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipientResolver: NotificationRecipientResolverService,
    private readonly gateway: NotificationsGateway
  ) {}

  async createFromOrderSupplierEvent(
    data: OrderSupplierNotifiedPayload
  ): Promise<void> {
    const recipientIds = await this.recipientResolver.resolveClinicRecipients(
      data.tenantId
    );
    if (recipientIds.length === 0) {
      return;
    }

    const notificationType =
      data.sourceStatus === "rejected"
        ? NotificationType.ORDER_SUPPLIER_REJECTED
        : NotificationType.ORDER_SUPPLIER_CONFIRMED;

    const dedupeKey = `order:${data.orderId}:webhook:${data.sourceStatus}`;

    const supplierLabel = [data.supplierCompanyName, data.supplierManagerName]
      .filter(Boolean)
      .join(" ");
    const title =
      supplierLabel ||
      (data.sourceStatus === "rejected" ? "주문 거절" : "주문 확정");

    const actionLine =
      data.sourceStatus === "rejected"
        ? "요청을 반려했습니다."
        : "요청을 수락했습니다.";
    const descLine = data.productSummary
      ? `${data.productSummary}의 주문`
      : `주문번호 ${data.orderNo}의 주문`;
    const body = `${descLine}\n${actionLine}`;

    const payloadJson = {
      orderNo: data.orderNo,
      sourceStatus: data.sourceStatus,
      rejectionReasons: data.rejectionReasons ?? undefined,
      adjustmentsCount: data.adjustmentsCount,
    };

    const rows = recipientIds.map((recipient_member_id) => ({
      tenant_id: data.tenantId,
      recipient_member_id,
      type: notificationType,
      title,
      body,
      entity_type: "order",
      entity_id: data.orderId,
      payload: payloadJson,
      dedupe_key: dedupeKey,
    }));

    const result = await this.prisma.notification.createMany({
      data: rows,
      skipDuplicates: true,
    });

    if (result.count === 0) {
      return;
    }

    const created = await this.prisma.notification.findMany({
      where: {
        tenant_id: data.tenantId,
        dedupe_key: dedupeKey,
      },
    });

    for (const row of created) {
      this.gateway.emitNotificationNew(
        row.recipient_member_id,
        toNotificationItemDto(row)
      );
    }
  }

  async createFromReturnSupplierEvent(
    data: ReturnSupplierNotifiedPayload
  ): Promise<void> {
    const recipientIds = await this.recipientResolver.resolveClinicRecipients(
      data.tenantId
    );
    if (recipientIds.length === 0) return;

    const notificationType =
      data.sourceStatus === "rejected"
        ? NotificationType.RETURN_SUPPLIER_REJECTED
        : NotificationType.RETURN_SUPPLIER_ACCEPTED;

    const supplierLabel = [data.supplierCompanyName, data.supplierManagerName]
      .filter(Boolean)
      .join(" ");
    const title = supplierLabel || "공급업체";

    const actionLine =
      data.sourceStatus === "rejected"
        ? "반납 요청을 반려했습니다."
        : "반납 접수가 완료되었습니다.";
    const descLine = data.productSummary
      ? `${data.productSummary}의 반납`
      : `반납번호 ${data.returnNo}의 반납`;
    const body = `${descLine}\n${actionLine}`;

    const dedupeKey = `return:${data.returnId}:${data.sourceStatus}`;

    const rows = recipientIds.map((recipient_member_id) => ({
      tenant_id: data.tenantId,
      recipient_member_id,
      type: notificationType,
      title,
      body,
      entity_type: "return",
      entity_id: data.returnId,
      payload: { returnNo: data.returnNo, sourceStatus: data.sourceStatus },
      dedupe_key: dedupeKey,
    }));

    const result = await this.prisma.notification.createMany({
      data: rows,
      skipDuplicates: true,
    });
    if (result.count === 0) return;

    const created = await this.prisma.notification.findMany({
      where: {
        tenant_id: data.tenantId,
        dedupe_key: dedupeKey,
      },
    });

    for (const row of created) {
      this.gateway.emitNotificationNew(
        row.recipient_member_id,
        toNotificationItemDto(row)
      );
    }
  }

  async listForMember(
    tenantId: string,
    memberId: string,
    opts: { limit: number; page: number }
  ) {
    const take = Math.min(Math.max(opts.limit, 1), 100);
    const page = Math.max(opts.page, 1);
    const skip = (page - 1) * take;

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: {
          tenant_id: tenantId,
          recipient_member_id: memberId,
        },
        orderBy: { created_at: "desc" },
        take,
        skip,
      }),
      this.prisma.notification.count({
        where: {
          tenant_id: tenantId,
          recipient_member_id: memberId,
        },
      }),
    ]);

    return {
      items: items.map(toNotificationItemDto),
      page,
      limit: take,
      total,
      hasMore: skip + items.length < total,
    };
  }

  async unreadCount(tenantId: string, memberId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        tenant_id: tenantId,
        recipient_member_id: memberId,
        read_at: null,
      },
    });
  }

  async markRead(
    id: string,
    tenantId: string,
    memberId: string
  ): Promise<{ ok: boolean }> {
    const now = new Date();
    const res = await this.prisma.notification.updateMany({
      where: {
        id,
        tenant_id: tenantId,
        recipient_member_id: memberId,
      },
      data: { read_at: now, updated_at: now },
    });

    if (res.count === 0) {
      throw new NotFoundException("Notification not found");
    }
    return { ok: true };
  }
}
