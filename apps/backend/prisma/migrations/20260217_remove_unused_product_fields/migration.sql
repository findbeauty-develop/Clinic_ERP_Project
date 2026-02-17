-- Remove unused fields from Product table
-- These fields are not used in the application anymore

-- Drop columns
ALTER TABLE "Product" DROP COLUMN IF EXISTS "expiry_date";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "inbound_qty";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "storage";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "packaging_to_unit";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "packaging_to_quantity";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "packaging_from_unit";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "packaging_from_quantity";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "has_different_packaging_quantity";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "expiry_months";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "expiry_unit";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "inbound_manager";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "status";

