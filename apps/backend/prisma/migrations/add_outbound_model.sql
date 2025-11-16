-- Add Outbound table for 출고 관리 (Outbound Management)

-- CreateTable
CREATE TABLE IF NOT EXISTS "Outbound" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "batch_no" TEXT NOT NULL,
    "outbound_qty" INTEGER NOT NULL,
    "outbound_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manager_name" TEXT NOT NULL,
    "patient_name" TEXT,
    "chart_number" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "created_by" TEXT,

    CONSTRAINT "Outbound_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Outbound" 
ADD CONSTRAINT "Outbound_product_id_fkey" 
FOREIGN KEY ("product_id") 
REFERENCES "Product"("id") 
ON DELETE CASCADE 
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbound" 
ADD CONSTRAINT "Outbound_batch_id_fkey" 
FOREIGN KEY ("batch_id") 
REFERENCES "Batch"("id") 
ON DELETE CASCADE 
ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Outbound_tenant_id_idx" ON "Outbound"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Outbound_product_id_idx" ON "Outbound"("product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Outbound_batch_id_idx" ON "Outbound"("batch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Outbound_outbound_date_idx" ON "Outbound"("outbound_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Outbound_tenant_id_outbound_date_idx" ON "Outbound"("tenant_id", "outbound_date");

