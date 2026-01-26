-- Add business_number and linked_supplier_manager_id columns to ClinicSupplierManager
ALTER TABLE "ClinicSupplierManager" 
  ADD COLUMN IF NOT EXISTS "business_number" TEXT,
  ADD COLUMN IF NOT EXISTS "linked_supplier_manager_id" TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "ClinicSupplierManager_business_number_idx" 
  ON "ClinicSupplierManager"("business_number");

CREATE INDEX IF NOT EXISTS "ClinicSupplierManager_linked_supplier_manager_id_idx" 
  ON "ClinicSupplierManager"("linked_supplier_manager_id");

CREATE INDEX IF NOT EXISTS "ClinicSupplierManager_tenant_id_business_number_idx" 
  ON "ClinicSupplierManager"("tenant_id", "business_number");

-- Add foreign key constraint for linked_supplier_manager_id
-- Note: This assumes SupplierManager table exists and has id column
-- If the foreign key already exists, this will fail gracefully due to IF NOT EXISTS
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ClinicSupplierManager_linked_supplier_manager_id_fkey'
  ) THEN
    ALTER TABLE "ClinicSupplierManager" 
      ADD CONSTRAINT "ClinicSupplierManager_linked_supplier_manager_id_fkey" 
      FOREIGN KEY ("linked_supplier_manager_id") 
      REFERENCES "SupplierManager"("id") 
      ON DELETE SET NULL 
      ON UPDATE CASCADE;
  END IF;
END $$;

