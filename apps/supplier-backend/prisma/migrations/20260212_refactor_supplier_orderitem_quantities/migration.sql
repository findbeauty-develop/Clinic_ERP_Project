-- Migration: Refactor SupplierOrderItem quantity fields for semantic clarity
-- Goal: 3 distinct quantity fields (Supplier Perspective)
--   1. received_order_quantity - Supplier qabul qilgan order miqdori (o'zgarmas)
--   2. confirmed_quantity - Supplier tasdiqlagan miqdor (supplier adjustment)
--   3. inbound_quantity - Clinic inbound qilgan miqdor (actual received)

-- Step 1: inbound_quantity already exists from previous migration, skip

-- Step 2: Add received_order_quantity column
ALTER TABLE "SupplierOrderItem" 
ADD COLUMN "received_order_quantity" INTEGER;

-- Step 3: Backup current quantity (this is supplier confirmed quantity)
UPDATE "SupplierOrderItem" 
SET received_order_quantity = quantity;

-- Step 4: Make received_order_quantity NOT NULL (it was nullable before)
ALTER TABLE "SupplierOrderItem" 
ALTER COLUMN "received_order_quantity" SET NOT NULL;

-- Step 5: Rename quantity to confirmed_quantity
ALTER TABLE "SupplierOrderItem" 
RENAME COLUMN "quantity" TO "confirmed_quantity";

-- Step 6: confirmed_quantity should be nullable (supplier might not have confirmed yet)
-- For new orders from clinic, confirmed_quantity will be NULL until supplier confirms
-- For existing orders, they are already confirmed, so keep the value
-- No action needed here, as confirmed_quantity is already the confirmed value

-- Step 7: Add comments for documentation
COMMENT ON COLUMN "SupplierOrderItem"."received_order_quantity" IS 'Supplier qabul qilgan order miqdori (clinic order, o''zgarmas)';
COMMENT ON COLUMN "SupplierOrderItem"."confirmed_quantity" IS 'Supplier tasdiqlagan miqdor (supplier adjustment, nullable)';
COMMENT ON COLUMN "SupplierOrderItem"."inbound_quantity" IS 'Clinic inbound qilgan miqdor (actual received by clinic, nullable)';

