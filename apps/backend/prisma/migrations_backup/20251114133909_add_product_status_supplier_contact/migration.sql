-- Add status column to Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT '활성';
UPDATE "Product" SET "status" = COALESCE("status", '활성');
ALTER TABLE "Product" ALTER COLUMN "status" SET NOT NULL;

-- Add expiry_unit to Batch
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "expiry_unit" TEXT;

-- Add supplier contact fields
ALTER TABLE "SupplierProduct"
  ADD COLUMN IF NOT EXISTS "contact_name" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_email" TEXT;
