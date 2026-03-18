-- Add item_status to SupplierOrderItem (item-level status for refactoring)
ALTER TABLE "SupplierOrderItem" ADD COLUMN "item_status" TEXT DEFAULT 'pending';

-- Backfill item_status from SupplierOrder.status for existing data
UPDATE "SupplierOrderItem" soi
SET "item_status" = CASE so.status
  WHEN 'confirmed' THEN 'confirmed'
  WHEN 'rejected' THEN 'rejected'
  WHEN 'completed' THEN 'confirmed'
  ELSE 'pending'
END
FROM "SupplierOrder" so
WHERE soi.order_id = so.id;

CREATE INDEX "SupplierOrderItem_item_status_idx" ON "SupplierOrderItem"("item_status");
