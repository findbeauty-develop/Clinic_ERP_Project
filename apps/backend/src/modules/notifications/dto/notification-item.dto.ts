/** REST list item and Socket.IO `notification.new` payload (same shape). */
export interface NotificationItemDto {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}
