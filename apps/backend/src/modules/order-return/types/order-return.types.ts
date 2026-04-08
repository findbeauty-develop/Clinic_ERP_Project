export type ReturnStatus = string;

export type DefectiveReturnTypeApi = "defective_exchange" | "defective_return";

export type ReturnItemRow = {
  id: string;
  tenant_id: string;
  supplier_manager_id: string | null;
  defective_return_no: string;
  defective_return_type: DefectiveReturnTypeApi;
  return_quantity: number;
  quantity_unit?: string | null;
  status: string;
  memo: string | null;
  images: string[] | null;
  return_manager: string | null;
  product_id: string;
  inbound_date: Date | null;
  created_at: Date;
  unit_price: number;
  total_quantity: number;
  product_name: string;
  brand: string | null;
  updated_at: Date | null;
};

export type SupplierManager = {
  id: string;
  name: string | null;
  position: string | null;
  phone_number: string | null;
  email1: string | null;
};

export type SupplierRow = {
  id: string;
  company_name: string | null;
  managers: SupplierManager[];
};

export type ProductRow = {
  id: string;
  name: string | null;
  returnPolicy: {
    refund_amount: number | null;
  } | null;
};

export type OutboundRow = {
  id: string;
  product_id: string | null;
  is_damaged: boolean | null;
  is_defective: boolean | null;
};

export type MemberRow = {
  member_id: string | null;
  full_name: string | null;
};

export type ProductSupplierRow = {
  product_id: string;
  clinicSupplierManager: {
    company_name: string | null;
    name: string | null;
    position: string | null;
    phone_number: string | null;
    email1: string | null;
    linkedManager: {
      supplier: {
        company_name: string | null;
        managers: SupplierManager[];
      } | null;
    } | null;
  } | null;
};

export type SupplierResolvedInfo = {
  supplierName: string;
  managerName: string;
  managerPosition: string;
  managerPhone: string;
  managerEmail: string;
  supplierManagerId: string | null;
};

export type ReturnLookupMaps = {
  supplierMap: Map<string, SupplierRow>;
  productMap: Map<string, ProductRow>;
  outboundMap: Map<string, OutboundRow>;
  memberMap: Map<string, MemberRow>;
  productSuppliersMap: Map<string, ProductSupplierRow>;
};

export type EnrichedReturn = ReturnItemRow & {
  supplierName: string;
  managerName: string;
  managerPosition: string;
  managerPhone: string;
  managerEmail: string;
  supplierManagerId: string | null;
  returnManagerName: string;
  product_name: string;
  refund_amount: number;
};
