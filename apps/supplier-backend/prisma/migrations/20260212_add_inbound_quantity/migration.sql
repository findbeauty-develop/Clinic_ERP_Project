-- Migration: Add inbound_quantity to SupplierOrderItem for tracking actual clinic inbound

-- Add inbound_quantity column (nullable for old orders)
ALTER TABLE "SupplierOrderItem"
  ADD COLUMN "inbound_quantity" INTEGER;

-- Add comment for clarity
COMMENT ON COLUMN "SupplierOrderItem"."quantity" IS 'Supplier confirmed quantity (e.g., 100)';
COMMENT ON COLUMN "SupplierOrderItem"."inbound_quantity" IS 'Actual quantity inbound by clinic (e.g., 80 for partial inbound)';

