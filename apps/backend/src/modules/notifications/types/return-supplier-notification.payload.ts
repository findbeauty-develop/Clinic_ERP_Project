export type ReturnSupplierStatus = "accepted" | "rejected" | "partial";

export type ReturnSupplierNotifiedPayload = {
  tenantId: string;
  returnId: string;
  returnNo: string;
  sourceStatus: ReturnSupplierStatus;
  supplierCompanyName?: string | null;
  supplierManagerName?: string | null;
  productSummary?: string | null;
};
