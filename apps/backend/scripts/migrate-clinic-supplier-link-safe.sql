-- SAFE Migration: Migrate ClinicSupplierLink from supplier_id to supplier_manager_id
-- This version checks what columns exist before migrating

-- Step 1: Check current table structure and migrate accordingly
DO $$
DECLARE
  has_supplier_id BOOLEAN;
  has_supplier_manager_id BOOLEAN;
BEGIN
  -- Check if supplier_id column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ClinicSupplierLink' 
    AND column_name = 'supplier_id'
  ) INTO has_supplier_id;

  -- Check if supplier_manager_id column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ClinicSupplierLink' 
    AND column_name = 'supplier_manager_id'
  ) INTO has_supplier_manager_id;

  -- If supplier_manager_id already exists, migration is done
  IF has_supplier_manager_id THEN
    RAISE NOTICE 'Migration already completed: supplier_manager_id column exists';
    RETURN;
  END IF;

  -- If supplier_id doesn't exist, something is wrong
  IF NOT has_supplier_id THEN
    RAISE EXCEPTION 'Neither supplier_id nor supplier_manager_id exists. Table structure is unexpected.';
  END IF;

  -- Migration needed: supplier_id exists, supplier_manager_id doesn't
  RAISE NOTICE 'Starting migration: supplier_id -> supplier_manager_id';

  -- Step 1a: Add new column supplier_manager_id (nullable first)
  ALTER TABLE "ClinicSupplierLink" ADD COLUMN "supplier_manager_id" TEXT;

  -- Step 1b: Migrate existing data
  UPDATE "ClinicSupplierLink" csl
  SET "supplier_manager_id" = (
    SELECT sm.id 
    FROM "SupplierManager" sm 
    WHERE sm.supplier_id = csl.supplier_id 
      AND sm.status = 'ACTIVE'
    ORDER BY sm.created_at ASC
    LIMIT 1
  )
  WHERE csl."supplier_manager_id" IS NULL 
    AND EXISTS (
      SELECT 1 FROM "SupplierManager" sm 
      WHERE sm.supplier_id = csl.supplier_id 
        AND sm.status = 'ACTIVE'
    );

  -- Step 1c: Delete records without SupplierManager
  DELETE FROM "ClinicSupplierLink" 
  WHERE "supplier_manager_id" IS NULL;

  -- Step 1d: Make supplier_manager_id NOT NULL
  ALTER TABLE "ClinicSupplierLink" ALTER COLUMN "supplier_manager_id" SET NOT NULL;

  -- Step 1e: Drop old constraints and column
  ALTER TABLE "ClinicSupplierLink" DROP CONSTRAINT IF EXISTS "ClinicSupplierLink_supplier_id_fkey";
  ALTER TABLE "ClinicSupplierLink" DROP CONSTRAINT IF EXISTS "ClinicSupplierLink_tenant_id_supplier_id_key";
  DROP INDEX IF EXISTS "ClinicSupplierLink_supplier_id_idx";
  ALTER TABLE "ClinicSupplierLink" DROP COLUMN IF EXISTS "supplier_id";

  RAISE NOTICE 'Migration completed successfully';
END $$;

-- Step 2: Ensure foreign key constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ClinicSupplierLink_supplier_manager_id_fkey'
  ) THEN
    ALTER TABLE "ClinicSupplierLink" 
      ADD CONSTRAINT "ClinicSupplierLink_supplier_manager_id_fkey" 
      FOREIGN KEY ("supplier_manager_id") 
      REFERENCES "SupplierManager"("id") 
      ON DELETE CASCADE;
  END IF;
END $$;

-- Step 3: Ensure unique constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ClinicSupplierLink_tenant_id_supplier_manager_id_key'
  ) THEN
    ALTER TABLE "ClinicSupplierLink" 
      ADD CONSTRAINT "ClinicSupplierLink_tenant_id_supplier_manager_id_key" 
      UNIQUE ("tenant_id", "supplier_manager_id");
  END IF;
END $$;

-- Step 4: Ensure index exists
CREATE INDEX IF NOT EXISTS "ClinicSupplierLink_supplier_manager_id_idx" ON "ClinicSupplierLink"("supplier_manager_id");

