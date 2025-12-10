-- Create OrderReturn table
-- This script creates the OrderReturn table with all required columns and indexes

-- Step 1: Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS "OrderReturn" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "order_id" TEXT,
  "order_no" TEXT,
  "outbound_id" TEXT,
  "return_no" TEXT,
  "batch_no" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "brand" TEXT,
  "return_quantity" INTEGER NOT NULL,
  "total_quantity" INTEGER NOT NULL,
  "unit_price" INTEGER NOT NULL,
  "return_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "memo" TEXT,
  "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "return_manager" TEXT,
  "supplier_id" TEXT,
  "inbound_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3),

  CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

-- Step 2: Add missing columns if table already exists but columns are missing
DO $$
BEGIN
  -- Add outbound_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'OrderReturn' AND column_name = 'outbound_id'
  ) THEN
    ALTER TABLE "OrderReturn" ADD COLUMN "outbound_id" TEXT;
  END IF;

  -- Add order_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'OrderReturn' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE "OrderReturn" ADD COLUMN "order_id" TEXT;
  END IF;

  -- Add order_no if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'OrderReturn' AND column_name = 'order_no'
  ) THEN
    ALTER TABLE "OrderReturn" ADD COLUMN "order_no" TEXT;
  END IF;

  -- Add return_no if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'OrderReturn' AND column_name = 'return_no'
  ) THEN
    ALTER TABLE "OrderReturn" ADD COLUMN "return_no" TEXT;
  END IF;

  -- Add return_manager if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'OrderReturn' AND column_name = 'return_manager'
  ) THEN
    ALTER TABLE "OrderReturn" ADD COLUMN "return_manager" TEXT;
  END IF;

  -- Add images array if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'OrderReturn' AND column_name = 'images'
  ) THEN
    ALTER TABLE "OrderReturn" ADD COLUMN "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
END $$;

-- Step 3: Create indexes (only if they don't exist)
CREATE INDEX IF NOT EXISTS "OrderReturn_tenant_id_idx" ON "OrderReturn"("tenant_id");
CREATE INDEX IF NOT EXISTS "OrderReturn_order_id_idx" ON "OrderReturn"("order_id");
CREATE INDEX IF NOT EXISTS "OrderReturn_outbound_id_idx" ON "OrderReturn"("outbound_id");
CREATE INDEX IF NOT EXISTS "OrderReturn_return_no_idx" ON "OrderReturn"("return_no");
CREATE INDEX IF NOT EXISTS "OrderReturn_status_idx" ON "OrderReturn"("status");
CREATE INDEX IF NOT EXISTS "OrderReturn_tenant_id_status_idx" ON "OrderReturn"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "OrderReturn_return_type_idx" ON "OrderReturn"("return_type");

