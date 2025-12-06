-- Safe migration: Check if ClinicSupplierLink already has supplier_manager_id
-- If yes, skip migration. If no, migrate from supplier_id to supplier_manager_id

-- Step 1: Check if supplier_manager_id column already exists
DO $$
BEGIN
  -- Check if supplier_manager_id column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ClinicSupplierLink' 
    AND column_name = 'supplier_manager_id'
  ) THEN
    -- Migration needed: supplier_id exists, need to migrate to supplier_manager_id
    
    -- Step 1a: Add new column supplier_manager_id (nullable first)
    ALTER TABLE "ClinicSupplierLink" ADD COLUMN "supplier_manager_id" TEXT;

    -- Step 1b: Migrate existing data: For each ClinicSupplierLink with supplier_id, 
    -- find the first ACTIVE SupplierManager for that Supplier and set supplier_manager_id
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

    -- Step 1c: Delete any ClinicSupplierLink records that don't have a SupplierManager
    DELETE FROM "ClinicSupplierLink" 
    WHERE "supplier_manager_id" IS NULL;

    -- Step 1d: Make supplier_manager_id NOT NULL
    ALTER TABLE "ClinicSupplierLink" ALTER COLUMN "supplier_manager_id" SET NOT NULL;

    -- Step 1e: Drop existing foreign key constraint on supplier_id
    ALTER TABLE "ClinicSupplierLink" DROP CONSTRAINT IF EXISTS "ClinicSupplierLink_supplier_id_fkey";

    -- Step 1f: Drop existing unique constraint on tenant_id + supplier_id
    ALTER TABLE "ClinicSupplierLink" DROP CONSTRAINT IF EXISTS "ClinicSupplierLink_tenant_id_supplier_id_key";

    -- Step 1g: Drop existing index on supplier_id
    DROP INDEX IF EXISTS "ClinicSupplierLink_supplier_id_idx";

    -- Step 1h: Drop the old supplier_id column
    ALTER TABLE "ClinicSupplierLink" DROP COLUMN IF EXISTS "supplier_id";

    RAISE NOTICE 'Migration completed: supplier_id migrated to supplier_manager_id';
  ELSE
    RAISE NOTICE 'Migration skipped: supplier_manager_id already exists';
  END IF;
END $$;

-- Step 2: Ensure foreign key constraint exists (safe to run multiple times)
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

-- Step 3: Ensure unique constraint exists (safe to run multiple times)
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

-- Step 4: Ensure index exists (safe to run multiple times)
CREATE INDEX IF NOT EXISTS "ClinicSupplierLink_supplier_manager_id_idx" ON "ClinicSupplierLink"("supplier_manager_id");

