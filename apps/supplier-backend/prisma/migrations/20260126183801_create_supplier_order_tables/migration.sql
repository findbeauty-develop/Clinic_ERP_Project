-- Create SupplierOrder table
CREATE TABLE IF NOT EXISTS "SupplierOrder" (
    "id" TEXT NOT NULL,
    "supplier_tenant_id" TEXT NOT NULL,
    "supplier_manager_id" TEXT,
    "clinic_tenant_id" TEXT,
    "clinic_name" TEXT,
    "clinic_manager_name" TEXT,
    "order_no" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_amount" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "original_order_id" TEXT,
    "is_split_order" BOOLEAN NOT NULL DEFAULT false,
    "split_sequence" INTEGER,
    "split_reason" TEXT,

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

-- Create SupplierOrderItem table
CREATE TABLE IF NOT EXISTS "SupplierOrderItem" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT,
    "product_name" TEXT NOT NULL,
    "brand" TEXT,
    "unit" TEXT,
    "batch_no" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total_price" INTEGER NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "SupplierOrderItem_pkey" PRIMARY KEY ("id")
);

-- Create indexes for SupplierOrder
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierOrder_order_no_key" ON "SupplierOrder"("order_no");
CREATE INDEX IF NOT EXISTS "SupplierOrder_supplier_tenant_id_idx" ON "SupplierOrder"("supplier_tenant_id");
CREATE INDEX IF NOT EXISTS "SupplierOrder_supplier_manager_id_idx" ON "SupplierOrder"("supplier_manager_id");
CREATE INDEX IF NOT EXISTS "SupplierOrder_clinic_tenant_id_idx" ON "SupplierOrder"("clinic_tenant_id");
CREATE INDEX IF NOT EXISTS "SupplierOrder_status_idx" ON "SupplierOrder"("status");
CREATE INDEX IF NOT EXISTS "SupplierOrder_order_date_idx" ON "SupplierOrder"("order_date");
CREATE INDEX IF NOT EXISTS "SupplierOrder_original_order_id_idx" ON "SupplierOrder"("original_order_id");

-- Create indexes for SupplierOrderItem
CREATE INDEX IF NOT EXISTS "SupplierOrderItem_order_id_idx" ON "SupplierOrderItem"("order_id");
CREATE INDEX IF NOT EXISTS "SupplierOrderItem_product_id_idx" ON "SupplierOrderItem"("product_id");

-- Add foreign key constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'SupplierOrderItem_order_id_fkey'
  ) THEN
    ALTER TABLE "SupplierOrderItem" 
      ADD CONSTRAINT "SupplierOrderItem_order_id_fkey" 
      FOREIGN KEY ("order_id") 
      REFERENCES "SupplierOrder"("id") 
      ON DELETE CASCADE 
      ON UPDATE CASCADE;
  END IF;
END $$;

