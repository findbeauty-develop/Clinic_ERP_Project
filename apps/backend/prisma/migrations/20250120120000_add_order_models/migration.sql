-- CreateTable
CREATE TABLE IF NOT EXISTS "Order" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "supplier_id" TEXT,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_delivery_date" TIMESTAMP(3),
    "created_by" TEXT,
    "approved_by" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrderItem" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total_price" INTEGER NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrderDraft" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Order_order_no_key" ON "Order"("order_no");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrderDraft_tenant_id_session_id_key" ON "OrderDraft"("tenant_id", "session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_tenant_id_idx" ON "Order"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_supplier_id_idx" ON "Order"("supplier_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_order_date_idx" ON "Order"("order_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_tenant_id_status_idx" ON "Order"("tenant_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_tenant_id_order_date_idx" ON "Order"("tenant_id", "order_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_tenant_id_idx" ON "OrderItem"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_order_id_idx" ON "OrderItem"("order_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_product_id_idx" ON "OrderItem"("product_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_batch_id_idx" ON "OrderItem"("batch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_tenant_id_order_id_idx" ON "OrderItem"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderDraft_tenant_id_idx" ON "OrderDraft"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderDraft_session_id_idx" ON "OrderDraft"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderDraft_expires_at_idx" ON "OrderDraft"("expires_at");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

