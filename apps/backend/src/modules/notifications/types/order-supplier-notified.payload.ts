export type OrderSupplierWebhookStatus = "supplier_confirmed" | "rejected";

export interface OrderSupplierNotifiedPayload {
  tenantId: string;
  orderId: string;
  orderNo: string;
  sourceStatus: OrderSupplierWebhookStatus;
  rejectionReasons?: Record<string, string> | null;
  adjustmentsCount: number;
}
