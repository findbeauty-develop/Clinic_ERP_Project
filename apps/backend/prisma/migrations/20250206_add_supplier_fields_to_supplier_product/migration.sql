-- Add supplier_tenant_id and company_name to SupplierProduct table

-- Step 1: Add new columns
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "supplier_tenant_id" TEXT;
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "company_name" TEXT;

-- Step 2: Create index for supplier_tenant_id
CREATE INDEX IF NOT EXISTS "SupplierProduct_supplier_tenant_id_idx" ON "SupplierProduct"("supplier_tenant_id");

-- Step 3: Update existing data (populate supplier_tenant_id and company_name from Supplier table)
UPDATE "SupplierProduct" sp
SET 
  supplier_tenant_id = s.tenant_id,
  company_name = s.company_name
FROM "Supplier" s
WHERE sp.supplier_id = s.id
  AND sp.supplier_tenant_id IS NULL;

-- Note: For SupplierProducts with supplier_id that doesn't match a UUID,
-- we'll leave supplier_tenant_id and company_name as NULL (legacy data)


