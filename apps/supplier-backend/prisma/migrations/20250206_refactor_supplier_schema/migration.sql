-- Refactor Supplier schema
-- 1. Remove business_type and business_item from Supplier table
-- 2. Make tenant_id unique in Supplier table
-- 3. Rename supplier_id to supplier_tenant_id in SupplierManager
-- 4. Remove email2 from SupplierManager
-- 5. Replace responsible_regions with manager_address in SupplierManager

-- Step 1: Remove business_type and business_item from Supplier
ALTER TABLE "Supplier" DROP COLUMN IF EXISTS "business_type";
ALTER TABLE "Supplier" DROP COLUMN IF EXISTS "business_item";

-- Step 2: Make tenant_id unique in Supplier (for SupplierManager relation)
-- First, ensure all existing tenant_id values are unique
DO $$
BEGIN
  -- Update any NULL tenant_id values with unique values
  UPDATE "Supplier"
  SET tenant_id = 'supplier_' || business_number || '_' || EXTRACT(EPOCH FROM NOW())::text
  WHERE tenant_id IS NULL;
END $$;

-- Make tenant_id NOT NULL and UNIQUE
ALTER TABLE "Supplier" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_tenant_id_key" ON "Supplier"("tenant_id");

-- Step 3: Add new columns to SupplierManager before dropping old ones
ALTER TABLE "SupplierManager" ADD COLUMN IF NOT EXISTS "supplier_tenant_id" TEXT;
ALTER TABLE "SupplierManager" ADD COLUMN IF NOT EXISTS "manager_address" TEXT;
ALTER TABLE "SupplierManager" ADD COLUMN IF NOT EXISTS "created_by" TEXT;

-- Copy data from supplier_id to supplier_tenant_id (using Supplier.tenant_id)
UPDATE "SupplierManager" sm
SET supplier_tenant_id = s.tenant_id
FROM "Supplier" s
WHERE sm.supplier_id = s.id;

-- Copy first element of responsible_regions to manager_address
UPDATE "SupplierManager"
SET manager_address = responsible_regions[1]
WHERE responsible_regions IS NOT NULL AND array_length(responsible_regions, 1) > 0;

-- Step 4: Drop old columns
ALTER TABLE "SupplierManager" DROP COLUMN IF EXISTS "supplier_id";
ALTER TABLE "SupplierManager" DROP COLUMN IF EXISTS "email2";
ALTER TABLE "SupplierManager" DROP COLUMN IF EXISTS "responsible_regions";

-- Step 5: Make supplier_tenant_id NOT NULL
ALTER TABLE "SupplierManager" ALTER COLUMN "supplier_tenant_id" SET NOT NULL;

-- Step 6: Create new indexes
CREATE INDEX IF NOT EXISTS "SupplierManager_supplier_tenant_id_idx" ON "SupplierManager"("supplier_tenant_id");
CREATE INDEX IF NOT EXISTS "SupplierManager_created_by_idx" ON "SupplierManager"("created_by");

-- Step 7: Drop old indexes
DROP INDEX IF EXISTS "SupplierManager_supplier_id_idx";

-- Step 8: Make password_hash and email1 optional (already done in previous migration, but ensuring)
ALTER TABLE "SupplierManager" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "SupplierManager" ALTER COLUMN "email1" DROP NOT NULL;

