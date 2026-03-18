-- Remove status and memo from SupplierOrder (order state derived from SupplierOrderItem.item_status)
DROP INDEX IF EXISTS "SupplierOrder_status_idx";
ALTER TABLE "SupplierOrder" DROP COLUMN IF EXISTS "status";
ALTER TABLE "SupplierOrder" DROP COLUMN IF EXISTS "memo";
