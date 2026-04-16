/**
 * Single-product detail view (getProduct API shape).
 * Pure mapping — Prisma fetch stays in ProductsService.
 */

import { mapProductGtinsToBarcodeItems } from "./product-gtin.mapper";
import { mapClinicSupplierManagerToDetailRowFields } from "./product-supplier.mapper";

const FOUR_MONTHS_MS = 120 * 24 * 60 * 60 * 1000;

function mapPurchasePathsForDetail(paths: any[] | undefined) {
  if (!paths?.length) return [];
  const now = Date.now();
  return paths.map((p) => {
    const last = p.last_used_at ? new Date(p.last_used_at).getTime() : null;
    const longUnused =
      last != null && now - last >= FOUR_MONTHS_MS ? true : false;
    const m = p.clinicSupplierManager;
    return {
      id: p.id,
      pathType: p.path_type,
      isDefault: p.is_default,
      sortOrder: p.sort_order,
      lastUsedAt: p.last_used_at,
      clinicSupplierManagerId: p.clinic_supplier_manager_id,
      siteName: p.site_name,
      siteUrl: p.site_url,
      normalizedDomain: p.normalized_domain,
      otherText: p.other_text,
      longUnusedTag: longUnused,
      manager:
        m != null
          ? {
              id: m.id,
              companyName: m.company_name,
              name: m.name,
              position: m.position,
              phoneNumber: m.phone_number,
              platformLinked: !!m.linked_supplier_manager_id,
              businessNumber: m.business_number ?? null,
              companyPhone: m.company_phone ?? null,
              companyEmail: m.company_email ?? null,
              companyAddress: m.company_address ?? null,
              email1: m.email1 ?? null,
              email2: m.email2 ?? null,
              responsibleProducts: m.responsible_products ?? [],
              responsibleRegions: m.responsible_regions ?? [],
              memo: m.memo ?? null,
            }
          : null,
    };
  });
}

/** Loaded product from getProduct query (include shape). */
export function mapPrismaProductToDetailView(product: any) {
  const latestBatch = (product.batches as any[])?.[0];
  const productSupplier = product.productSupplier;
  const supplierManager = productSupplier?.clinicSupplierManager;
  const purchasePrice =
    productSupplier?.purchase_price ?? product.purchase_price;

  return {
    id: product.id,
    productName: product.name,
    brand: product.brand,
    barcode: product.barcode ?? null,
    barcodes: mapProductGtinsToBarcodeItems(product.productGtins),
    productImage: product.image_url,
    category: product.category,
    status: null,
    currentStock: product.current_stock,
    inboundQty: null,
    minStock: product.min_stock,
    purchasePrice,
    taxRate: product.tax_rate ?? 0,
    salePrice: product.sale_price,
    unit: product.unit,
    capacityPerProduct: product.capacity_per_product,
    capacityUnit: product.capacity_unit,
    usageCapacity: product.usage_capacity,
    ...mapClinicSupplierManagerToDetailRowFields(supplierManager),
    expiryDate: latestBatch?.expiry_date ?? null,
    storageLocation: latestBatch?.storage ?? null,
    productStorage: latestBatch?.storage ?? null,
    inboundManager: null,
    memo: product.returnPolicy?.note ?? null,
    isReturnable: product.returnPolicy?.is_returnable ?? false,
    refundAmount: product.returnPolicy?.refund_amount ?? null,
    returnStorage: product.returnPolicy?.return_storage ?? null,
    alertDays: product.alert_days ?? null,
    hasExpiryPeriod: product.has_expiry_period ?? false,
    purchasePaths: mapPurchasePathsForDetail(product.purchasePaths),
  };
}
