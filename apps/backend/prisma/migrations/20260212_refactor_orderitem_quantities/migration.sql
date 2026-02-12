-- Migration: Refactor OrderItem quantity fields for semantic clarity
-- Goal: 3 distinct quantity fields
--   1. ordered_quantity - Clinic order qilgan (o'zgarmas)
--   2. confirmed_quantity - Supplier tasdiqlagan (supplier adjustment)
--   3. inbound_quantity - Clinic inbound qilgan (haqiqiy inbound)

-- Step 1: Add inbound_quantity column
ALTER TABLE "OrderItem" 
ADD COLUMN "inbound_quantity" INTEGER;

-- Step 2: Create temporary column for data migration
ALTER TABLE "OrderItem" 
ADD COLUMN "quantity_backup" INTEGER;

-- Step 3: Backup current quantity (supplier confirmed quantity)
UPDATE "OrderItem" 
SET quantity_backup = quantity;

-- Step 4: Rename confirmed_quantity to ordered_quantity
-- (confirmed_quantity is currently storing the original ordered quantity)
ALTER TABLE "OrderItem" 
RENAME COLUMN "confirmed_quantity" TO "ordered_quantity";

-- Step 5: Rename quantity to confirmed_quantity_temp
-- (quantity is currently storing supplier confirmed quantity)
ALTER TABLE "OrderItem" 
RENAME COLUMN "quantity" TO "confirmed_quantity_temp";

-- Step 6: Data migration based on order status
-- For completed orders: set inbound_quantity = confirmed_quantity_temp
UPDATE "OrderItem" oi
SET inbound_quantity = oi.confirmed_quantity_temp
FROM "Order" o
WHERE oi.order_id = o.id 
  AND o.status IN ('inbound_completed', 'pending_inbound');

-- For pending orders (not yet confirmed by supplier): 
-- confirmed_quantity should equal ordered_quantity
UPDATE "OrderItem" oi
SET confirmed_quantity_temp = oi.ordered_quantity
FROM "Order" o
WHERE oi.order_id = o.id 
  AND o.status IN ('draft', 'pending')
  AND oi.confirmed_quantity_temp IS NULL;

-- Step 7: Rename temp column to final name
ALTER TABLE "OrderItem" 
RENAME COLUMN "confirmed_quantity_temp" TO "confirmed_quantity";

-- Step 8: Make ordered_quantity NOT NULL (it was nullable before)
-- First, ensure all records have a value
UPDATE "OrderItem" 
SET ordered_quantity = confirmed_quantity 
WHERE ordered_quantity IS NULL;

ALTER TABLE "OrderItem" 
ALTER COLUMN "ordered_quantity" SET NOT NULL;

-- Step 9: Make confirmed_quantity NULLABLE (supplier hali tasdiqlamagan bo'lishi mumkin)
-- For orders not yet confirmed by supplier, set to NULL
UPDATE "OrderItem" oi
SET confirmed_quantity = NULL
FROM "Order" o
WHERE oi.order_id = o.id 
  AND o.status IN ('draft', 'pending');

-- For confirmed orders, ensure value exists
UPDATE "OrderItem" 
SET confirmed_quantity = ordered_quantity 
WHERE confirmed_quantity IS NULL 
  AND order_id IN (
    SELECT id FROM "Order" 
    WHERE status NOT IN ('draft', 'pending')
  );

-- Step 10: Drop backup column
ALTER TABLE "OrderItem" 
DROP COLUMN "quantity_backup";

-- Step 11: Add comment for documentation
COMMENT ON COLUMN "OrderItem"."ordered_quantity" IS 'Clinic order qilgan miqdor (dastlabki, o''zgarmas)';
COMMENT ON COLUMN "OrderItem"."confirmed_quantity" IS 'Supplier tasdiqlagan miqdor (nullable - supplier confirm qilmaguncha null)';
COMMENT ON COLUMN "OrderItem"."inbound_quantity" IS 'Clinic inbound qilgan miqdor (haqiqiy inbound, partial bo''lishi mumkin)';

