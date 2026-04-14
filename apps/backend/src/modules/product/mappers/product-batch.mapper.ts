/**
 * Admin / API batch row (getProductBatches & getProductBatchHistory).
 * Pure: no DB, no service deps.
 */
export function mapProductBatchToAdminRow(batch: {
  id: string;
  batch_no: string | null;
  expiry_date: Date | null;
  expiry_months: number | null;
  expiry_unit: string | null;
  manufacture_date: Date | null;
  alert_days: string | null;
  storage: string | null;
  created_at: Date;
  qty: number;
  inbound_qty: number | null;
  used_count?: number | null;
  outbound_count?: number | null;
  unit: string | null;
  min_stock: number | null;
  purchase_price: number | null;
  is_separate_purchase: boolean | null;
  inbound_manager: string | null;
  reason_for_modification: string | null;
}) {
  return {
    id: batch.id,
    batch_no: batch.batch_no,
    유효기간: batch.expiry_date
      ? batch.expiry_date.toISOString().split("T")[0]
      : batch.expiry_months && batch.expiry_unit
        ? `${batch.expiry_months} ${batch.expiry_unit}`
        : null,
    보관위치: batch.storage ?? null,
    "입고 수량": batch.qty,
    inbound_qty: batch.inbound_qty ?? null,
    unit: batch.unit ?? null,
    min_stock: batch.min_stock ?? null,
    purchase_price: batch.purchase_price ?? null,
    created_at: batch.created_at,
    is_separate_purchase: batch.is_separate_purchase ?? false,
    manufacture_date: batch.manufacture_date
      ? batch.manufacture_date.toISOString().split("T")[0]
      : null,
    expiry_date: batch.expiry_date
      ? batch.expiry_date.toISOString().split("T")[0]
      : null,
    inbound_manager: batch.inbound_manager ?? null,
    reason_for_modification: batch.reason_for_modification ?? null,
    expiry_months: batch.expiry_months,
    expiry_unit: batch.expiry_unit,
    alert_days: batch.alert_days,
    storage: batch.storage,
    qty: batch.qty,
  };
}
export function mapProductBatchesToAdminRows(
  batches: Parameters<typeof mapProductBatchToAdminRow>[0][]
) {
  return batches.map(mapProductBatchToAdminRow);
}
