-- Add confirmed_quantity field to OrderItem table
-- This field stores the original ordered quantity before any supplier adjustments

-- Add the column (nullable at first)
ALTER TABLE "OrderItem" ADD COLUMN "confirmed_quantity" INTEGER;

-- Backfill existing records: confirmed_quantity = quantity
UPDATE "OrderItem" SET "confirmed_quantity" = "quantity" WHERE "confirmed_quantity" IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN "OrderItem"."confirmed_quantity" IS 'Original ordered quantity before supplier adjustments';

