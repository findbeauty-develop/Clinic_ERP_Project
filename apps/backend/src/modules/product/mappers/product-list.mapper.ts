/**
 * List / cache product row (same shape as getAllProducts list items).
 * Pure mapping — no Prisma, no service state.
 */

import {
  type ClinicSupplierManagerLike,
  mapClinicSupplierManagerToListRowFields,
} from "./product-supplier.mapper";

export type ProductListRowExtras = {
  alertDays: string | null;
  hasExpiryPeriod: boolean;
};

export function mapProductToListRow(
  product: {
    id: string;
    name: string;
    brand: string;
    barcode?: string | null;
    image_url?: string | null;
    category: string;
    current_stock: number;
    min_stock: number;
    purchase_price?: number | null;
    sale_price?: number | null;
    unit?: string | null;
    usage_capacity?: number | null;
    capacity_unit?: string | null;
    capacity_per_product?: number | null;
    batches?: unknown[] | null;
  },
  memo: string | null,
  supplierManager: ClinicSupplierManagerLike,
  options: {
    taxRate: number | null | undefined;
    batches: unknown[];
    listExtras?: ProductListRowExtras;
  }
) {
  const rawBatchesForLatest = product.batches ?? [];
  const latestBatch = (rawBatchesForLatest[0] ?? null) as
    | { expiry_date?: Date | string | null; storage?: string | null }
    | null;

  const row: Record<string, unknown> = {
    id: product.id,
    productName: product.name,
    brand: product.brand,
    barcode: product.barcode,
    productImage: product.image_url,
    category: product.category,
    status: null,
    currentStock: product.current_stock,
    minStock: product.min_stock,
    purchasePrice: product.purchase_price,
    taxRate: options.taxRate,
    salePrice: product.sale_price,
    unit: product.unit,
    usageCapacity: product.usage_capacity,
    usageCapacityUnit: product.capacity_unit,
    capacityPerProduct: product.capacity_per_product,
    capacityUnit: product.capacity_unit,
    ...mapClinicSupplierManagerToListRowFields(supplierManager),
    expiryDate: latestBatch?.expiry_date ?? null,
    storageLocation: latestBatch?.storage ?? null,
    productStorage: latestBatch?.storage ?? null,
    memo,
    expiryMonths: null,
    expiryUnit: null,
    isLowStock: product.current_stock < product.min_stock,
    batches: options.batches,
  };

  if (options.listExtras) {
    row.alertDays = options.listExtras.alertDays;
    row.hasExpiryPeriod = options.listExtras.hasExpiryPeriod;
  }

  return row;
}
