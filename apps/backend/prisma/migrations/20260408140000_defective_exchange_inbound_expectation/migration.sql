-- 교환 확인 후 입고 대기 (Order/OrderItemsiz); Batch yaratish bilan yopiladi
CREATE TABLE "DefectiveExchangeInboundExpectation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "defective_product_return_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "expected_qty" INTEGER NOT NULL,
    "received_qty" INTEGER NOT NULL DEFAULT 0,
    "supplier_manager_id" TEXT,
    "unit_price" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fulfilled_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefectiveExchangeInboundExpectation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DefectiveExchangeInboundExpectation_defective_product_return_id_key" ON "DefectiveExchangeInboundExpectation"("defective_product_return_id");

CREATE INDEX "DefectiveExchangeInboundExpectation_tenant_id_idx" ON "DefectiveExchangeInboundExpectation"("tenant_id");

CREATE INDEX "DefectiveExchangeInboundExpectation_tenant_id_status_idx" ON "DefectiveExchangeInboundExpectation"("tenant_id", "status");

CREATE INDEX "DefectiveExchangeInboundExpectation_product_id_idx" ON "DefectiveExchangeInboundExpectation"("product_id");

ALTER TABLE "DefectiveExchangeInboundExpectation" ADD CONSTRAINT "DefectiveExchangeInboundExpectation_defective_product_return_id_fkey" FOREIGN KEY ("defective_product_return_id") REFERENCES "DefectiveProductReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
