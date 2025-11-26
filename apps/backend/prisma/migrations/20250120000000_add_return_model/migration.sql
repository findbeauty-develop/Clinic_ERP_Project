-- CreateTable
CREATE TABLE IF NOT EXISTS "Return" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "outbound_id" TEXT,
    "batch_no" TEXT NOT NULL,
    "supplier_id" TEXT,
    "return_qty" INTEGER NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refund_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_refund" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manager_name" TEXT NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "created_by" TEXT,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Return_tenant_id_idx" ON "Return"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Return_product_id_idx" ON "Return"("product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Return_batch_id_idx" ON "Return"("batch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Return_outbound_id_idx" ON "Return"("outbound_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Return_return_date_idx" ON "Return"("return_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Return_tenant_id_return_date_idx" ON "Return"("tenant_id", "return_date");

-- AddForeignKey (with existence check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Return_product_id_fkey'
    ) THEN
        ALTER TABLE "Return" ADD CONSTRAINT "Return_product_id_fkey" 
        FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey (with existence check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Return_batch_id_fkey'
    ) THEN
        ALTER TABLE "Return" ADD CONSTRAINT "Return_batch_id_fkey" 
        FOREIGN KEY ("batch_id") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey (with existence check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Return_outbound_id_fkey'
    ) THEN
        ALTER TABLE "Return" ADD CONSTRAINT "Return_outbound_id_fkey" 
        FOREIGN KEY ("outbound_id") REFERENCES "Outbound"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

