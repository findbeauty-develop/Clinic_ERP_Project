-- Create ClinicSupplierManager table
CREATE TABLE IF NOT EXISTS "ClinicSupplierManager" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email1" TEXT,
    "email2" TEXT,
    "position" TEXT,
    "certificate_image_url" TEXT,
    "responsible_regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responsible_products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "ClinicSupplierManager_pkey" PRIMARY KEY ("id")
);

-- Add clinic_manager_id to SupplierManager (nullable)
ALTER TABLE "SupplierManager" 
  ADD COLUMN IF NOT EXISTS "clinic_manager_id" TEXT;

-- Update SupplierManager: make password_hash and email1 required (remove null values first)
-- Only update if there are null values (these should be ClinicSupplierManager records)
-- Delete SupplierManager records with null password_hash (they should be in ClinicSupplierManager)
DELETE FROM "SupplierManager" 
WHERE "password_hash" IS NULL OR "email1" IS NULL;

-- Now make them required
ALTER TABLE "SupplierManager" 
  ALTER COLUMN "password_hash" SET NOT NULL,
  ALTER COLUMN "email1" SET NOT NULL;

-- Remove created_by column (no longer needed)
ALTER TABLE "SupplierManager" 
  DROP COLUMN IF EXISTS "created_by";

-- Create indexes
CREATE INDEX IF NOT EXISTS "ClinicSupplierManager_supplier_id_idx" ON "ClinicSupplierManager"("supplier_id");
CREATE INDEX IF NOT EXISTS "ClinicSupplierManager_tenant_id_idx" ON "ClinicSupplierManager"("tenant_id");
CREATE INDEX IF NOT EXISTS "ClinicSupplierManager_phone_number_idx" ON "ClinicSupplierManager"("phone_number");
CREATE INDEX IF NOT EXISTS "ClinicSupplierManager_tenant_id_phone_number_idx" ON "ClinicSupplierManager"("tenant_id", "phone_number");
CREATE INDEX IF NOT EXISTS "SupplierManager_clinic_manager_id_idx" ON "SupplierManager"("clinic_manager_id");

-- Add foreign keys
ALTER TABLE "ClinicSupplierManager" 
  ADD CONSTRAINT "ClinicSupplierManager_supplier_id_fkey" 
  FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierManager" 
  ADD CONSTRAINT "SupplierManager_clinic_manager_id_fkey" 
  FOREIGN KEY ("clinic_manager_id") REFERENCES "ClinicSupplierManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

