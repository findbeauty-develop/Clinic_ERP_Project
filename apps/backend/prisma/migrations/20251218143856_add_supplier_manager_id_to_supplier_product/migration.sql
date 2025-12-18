-- Add supplier_manager_id to SupplierProduct table

-- Step 1: Add new column
ALTER TABLE "SupplierProduct" ADD COLUMN IF NOT EXISTS "supplier_manager_id" TEXT;

-- Step 2: Create index for supplier_manager_id
CREATE INDEX IF NOT EXISTS "SupplierProduct_supplier_manager_id_idx" ON "SupplierProduct"("supplier_manager_id");

