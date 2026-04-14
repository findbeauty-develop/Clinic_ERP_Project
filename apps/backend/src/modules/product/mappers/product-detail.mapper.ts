/**
 * Single-product detail view (getProduct API shape).
 * Pure mapping — Prisma fetch stays in ProductsService.
 */

import { mapProductGtinsToBarcodeItems } from "./product-gtin.mapper";
import { mapClinicSupplierManagerToDetailRowFields } from "./product-supplier.mapper";

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
  };
}
