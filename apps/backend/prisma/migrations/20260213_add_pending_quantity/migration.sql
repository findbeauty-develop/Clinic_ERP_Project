-- Migration: Add pending_quantity to OrderItem
-- Goal: Denormalize pending quantity for performance and UX
--   pending_quantity = confirmed_quantity - inbound_quantity

-- Step 1: Add pending_quantity column (nullable first)
ALTER TABLE "OrderItem" 
ADD COLUMN "pending_quantity" INTEGER;

-- Step 2: Calculate initial values for existing records
UPDATE "OrderItem" 
SET pending_quantity = COALESCE(confirmed_quantity, ordered_quantity, 0) - COALESCE(inbound_quantity, 0)
WHERE pending_quantity IS NULL;

-- Step 3: Add comment for documentation
COMMENT ON COLUMN "OrderItem"."pending_quantity" IS 'Qolgan inbound qilish kerak bo''lgan quantity (confirmed - inbound). Updated on every inbound.';

-- Note: This is a denormalized field for performance
-- It should be updated whenever inbound_quantity changes

