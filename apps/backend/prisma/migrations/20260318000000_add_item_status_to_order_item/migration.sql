-- Add item_status to OrderItem (item-level status for refactoring)
ALTER TABLE "OrderItem" ADD COLUMN "item_status" TEXT DEFAULT 'pending';

-- Backfill item_status from Order.status for existing data
UPDATE "OrderItem" oi
SET "item_status" = CASE o.status
  WHEN 'completed' THEN 'inbounded'
  WHEN 'inbound_completed' THEN 'inbounded'
  WHEN 'supplier_confirmed' THEN 'confirmed'
  WHEN 'rejected' THEN 'rejected'
  WHEN 'confirmed_rejected' THEN 'rejection_acknowledged'
  WHEN 'cancelled' THEN 'cancelled'
  WHEN 'pending_inbound' THEN CASE WHEN (oi.inbound_quantity IS NOT NULL AND oi.inbound_quantity > 0) THEN 'inbounded' ELSE 'confirmed' END
  ELSE 'pending'
END
FROM "Order" o
WHERE oi.order_id = o.id;

-- Add index for filtering by item_status
CREATE INDEX "OrderItem_item_status_idx" ON "OrderItem"("item_status");

-- Add item_status to SupplierOrderItem (clinic shadow table)
ALTER TABLE "SupplierOrderItem" ADD COLUMN "item_status" TEXT DEFAULT 'pending';
CREATE INDEX "SupplierOrderItem_item_status_idx" ON "SupplierOrderItem"("item_status");
