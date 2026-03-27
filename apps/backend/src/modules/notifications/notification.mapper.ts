import type { Notification } from "../../../node_modules/.prisma/client-backend";
import type { NotificationItemDto } from "./dto/notification-item.dto";

export function toNotificationItemDto(row: Notification): NotificationItemDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload:
      row.payload === null || row.payload === undefined
        ? null
        : (row.payload as Record<string, unknown>),
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}
