-- Migration: Add pending_quantity to SupplierOrderItem
-- Goal: Denormalize pending quantity for supplier visibility
--   pending_quantity = confirmed_quantity - inbound_quantity

-- Step 1: Add pending_quantity column (nullable first)
ALTER TABLE "SupplierOrderItem" 
ADD COLUMN "pending_quantity" INTEGER;

-- Step 2: Calculate initial values for existing records
UPDATE "SupplierOrderItem" 
SET pending_quantity = COALESCE(confirmed_quantity, received_order_quantity, 0) - COALESCE(inbound_quantity, 0)
WHERE pending_quantity IS NULL;

-- Step 3: Add comment for documentation
COMMENT ON COLUMN "SupplierOrderItem"."pending_quantity" IS 'Qolgan clinic inbound qilishi kerak bo''lgan quantity (confirmed - inbound). Updated via webhook from clinic.';

-- Note: This field is updated when clinic notifies supplier about inbound

