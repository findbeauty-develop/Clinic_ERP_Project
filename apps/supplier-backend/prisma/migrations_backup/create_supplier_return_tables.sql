-- Create SupplierReturnRequest and SupplierReturnItem tables
-- This script creates only these two tables without affecting other tables

-- Step 1: Create SupplierReturnRequest table if it doesn't exist
CREATE TABLE IF NOT EXISTS "SupplierReturnRequest" (
  "id" TEXT NOT NULL,
  "supplier_tenant_id" TEXT NOT NULL,
  "supplier_manager_id" TEXT,
  "clinic_tenant_id" TEXT NOT NULL,
  "clinic_name" TEXT NOT NULL,
  "clinic_manager_name" TEXT NOT NULL,
  "return_no" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "memo" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3),
  "confirmed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "rejected_reason" TEXT,

  CONSTRAINT "SupplierReturnRequest_pkey" PRIMARY KEY ("id")
);

-- Step 2: Create unique constraint on return_no if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'SupplierReturnRequest_return_no_key'
  ) THEN
    ALTER TABLE "SupplierReturnRequest" ADD CONSTRAINT "SupplierReturnRequest_return_no_key" UNIQUE ("return_no");
  END IF;
END $$;

-- Step 3: Create SupplierReturnItem table if it doesn't exist
CREATE TABLE IF NOT EXISTS "SupplierReturnItem" (
  "id" TEXT NOT NULL,
  "return_request_id" TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "brand" TEXT,
  "quantity" INTEGER NOT NULL,
  "return_type" TEXT NOT NULL,
  "memo" TEXT,
  "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "inbound_date" TEXT NOT NULL,
  "total_price" INTEGER NOT NULL,
  "order_no" TEXT,
  "batch_no" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3),

  CONSTRAINT "SupplierReturnItem_pkey" PRIMARY KEY ("id")
);

-- Step 4: Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'SupplierReturnItem_return_request_id_fkey'
  ) THEN
    ALTER TABLE "SupplierReturnItem" 
    ADD CONSTRAINT "SupplierReturnItem_return_request_id_fkey" 
    FOREIGN KEY ("return_request_id") 
    REFERENCES "SupplierReturnRequest"("id") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;
  END IF;
END $$;

-- Step 5: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "SupplierReturnRequest_supplier_tenant_id_idx" ON "SupplierReturnRequest"("supplier_tenant_id");
CREATE INDEX IF NOT EXISTS "SupplierReturnRequest_supplier_manager_id_idx" ON "SupplierReturnRequest"("supplier_manager_id");
CREATE INDEX IF NOT EXISTS "SupplierReturnRequest_clinic_tenant_id_idx" ON "SupplierReturnRequest"("clinic_tenant_id");
CREATE INDEX IF NOT EXISTS "SupplierReturnRequest_return_no_idx" ON "SupplierReturnRequest"("return_no");
CREATE INDEX IF NOT EXISTS "SupplierReturnRequest_status_idx" ON "SupplierReturnRequest"("status");
CREATE INDEX IF NOT EXISTS "SupplierReturnRequest_created_at_idx" ON "SupplierReturnRequest"("created_at");
CREATE INDEX IF NOT EXISTS "SupplierReturnItem_return_request_id_idx" ON "SupplierReturnItem"("return_request_id");

