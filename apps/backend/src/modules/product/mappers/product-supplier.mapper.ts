/**
 * ClinicSupplierManager (nested on ProductSupplier) → API fields.
 * Pure mapping — no DB.
 */

export type ClinicSupplierManagerCore = {
  id?: string | null;
  company_name?: string | null;
  name?: string | null;
  position?: string | null;
  phone_number?: string | null;
  email1?: string | null;
  company_address?: string | null;
  business_number?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  email2?: string | null;
  responsible_products?: unknown[] | null;
  memo?: string | null;
};

export type ClinicSupplierManagerLike =
  | ClinicSupplierManagerCore
  | null
  | undefined;

/** getAllProducts / cache list row supplier columns */
export function mapClinicSupplierManagerToListRowFields(
  manager: ClinicSupplierManagerLike
) {
  return {
    supplierId: manager?.id ?? null,
    supplierName: manager?.company_name ?? null,
    managerName: manager?.name ?? null,
    managerPosition: manager?.position ?? null,
  };
}

/** getProduct supplier + contact block */
export function mapClinicSupplierManagerToDetailRowFields(
  manager: ClinicSupplierManagerLike
) {
  return {
    supplierId: manager?.id ?? null,
    supplierName: manager?.company_name ?? null,
    managerName: manager?.name ?? null,
    contactPhone: manager?.phone_number ?? null,
    contactEmail: manager?.email1 ?? null,
    supplierCompanyAddress: manager?.company_address ?? null,
    supplierBusinessNumber: manager?.business_number ?? null,
    supplierCompanyPhone: manager?.company_phone ?? null,
    supplierCompanyEmail: manager?.company_email ?? null,
    supplierPosition: manager?.position ?? null,
    supplierEmail2: manager?.email2 ?? null,
    supplierResponsibleProducts: manager?.responsible_products ?? [],
    supplierMemo: manager?.memo ?? null,
  };
}
