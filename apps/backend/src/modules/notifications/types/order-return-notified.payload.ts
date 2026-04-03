export type OrderReturnSupplierAction = "accepted" | "rejected" | "completed";

export type OrderReturnSupplierNotifiedPayload = {
  tenantId: string;
  orderReturnId: string;
  returnNo: string | null;
  action: OrderReturnSupplierAction;
  productSummary?: string | null;
  supplierCompanyName?: string | null;
  supplierManagerName?: string | null;
  category?: "exchange" | "refund";
  rejectionReason?: string | null;
};
