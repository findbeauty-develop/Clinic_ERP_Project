-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierReturnNotification" (
    "id" TEXT NOT NULL,
    "supplier_manager_id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "clinic_tenant_id" TEXT NOT NULL,
    "clinic_name" TEXT,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_brand" TEXT NOT NULL,
    "product_code" TEXT,
    "return_qty" INTEGER NOT NULL,
    "refund_amount_per_item" DOUBLE PRECISION NOT NULL,
    "total_refund" DOUBLE PRECISION NOT NULL,
    "return_manager_name" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL,
    "batch_no" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),

    CONSTRAINT "SupplierReturnNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierReturnNotification_supplier_manager_id_idx" ON "SupplierReturnNotification"("supplier_manager_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierReturnNotification_return_id_idx" ON "SupplierReturnNotification"("return_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierReturnNotification_clinic_tenant_id_idx" ON "SupplierReturnNotification"("clinic_tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierReturnNotification_status_idx" ON "SupplierReturnNotification"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierReturnNotification_is_read_idx" ON "SupplierReturnNotification"("is_read");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierReturnNotification_supplier_manager_id_status_idx" ON "SupplierReturnNotification"("supplier_manager_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierReturnNotification_supplier_manager_id_is_read_idx" ON "SupplierReturnNotification"("supplier_manager_id", "is_read");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierReturnNotification_created_at_idx" ON "SupplierReturnNotification"("created_at");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'SupplierReturnNotification_supplier_manager_id_fkey'
    ) THEN
        ALTER TABLE "SupplierReturnNotification" ADD CONSTRAINT "SupplierReturnNotification_supplier_manager_id_fkey" 
        FOREIGN KEY ("supplier_manager_id") REFERENCES "SupplierManager"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

