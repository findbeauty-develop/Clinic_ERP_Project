-- Phase 1: additive tables for split return flows (tip 반납 vs order-return).
-- Legacy "SupplierReturnRequest" / "SupplierReturnItem" unchanged.

CREATE TABLE "SupplierTipReturnRequest" (
    "id" TEXT NOT NULL,
    "supplier_tenant_id" TEXT NOT NULL,
    "supplier_manager_id" TEXT,
    "clinic_tenant_id" TEXT NOT NULL,
    "clinic_name" TEXT NOT NULL,
    "clinic_manager_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "SupplierTipReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierTipReturnRequest_supplier_tenant_id_idx" ON "SupplierTipReturnRequest"("supplier_tenant_id");
CREATE INDEX "SupplierTipReturnRequest_supplier_manager_id_idx" ON "SupplierTipReturnRequest"("supplier_manager_id");
CREATE INDEX "SupplierTipReturnRequest_clinic_tenant_id_idx" ON "SupplierTipReturnRequest"("clinic_tenant_id");
CREATE INDEX "SupplierTipReturnRequest_status_idx" ON "SupplierTipReturnRequest"("status");
CREATE INDEX "SupplierTipReturnRequest_created_at_idx" ON "SupplierTipReturnRequest"("created_at");

CREATE TABLE "SupplierTipReturnItem" (
    "id" TEXT NOT NULL,
    "return_request_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "return_type" TEXT NOT NULL,
    "tip_return_price" INTEGER NOT NULL,
    "quantity_change_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "SupplierTipReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierTipReturnItem_return_request_id_idx" ON "SupplierTipReturnItem"("return_request_id");

ALTER TABLE "SupplierTipReturnItem" ADD CONSTRAINT "SupplierTipReturnItem_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "SupplierTipReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SupplierOrderReturnRequest" (
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

    CONSTRAINT "SupplierOrderReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierOrderReturnRequest_return_no_key" ON "SupplierOrderReturnRequest"("return_no");
CREATE INDEX "SupplierOrderReturnRequest_supplier_tenant_id_idx" ON "SupplierOrderReturnRequest"("supplier_tenant_id");
CREATE INDEX "SupplierOrderReturnRequest_supplier_manager_id_idx" ON "SupplierOrderReturnRequest"("supplier_manager_id");
CREATE INDEX "SupplierOrderReturnRequest_clinic_tenant_id_idx" ON "SupplierOrderReturnRequest"("clinic_tenant_id");
CREATE INDEX "SupplierOrderReturnRequest_return_no_idx" ON "SupplierOrderReturnRequest"("return_no");
CREATE INDEX "SupplierOrderReturnRequest_status_idx" ON "SupplierOrderReturnRequest"("status");
CREATE INDEX "SupplierOrderReturnRequest_created_at_idx" ON "SupplierOrderReturnRequest"("created_at");

CREATE TABLE "SupplierOrderReturnItem" (
    "id" TEXT NOT NULL,
    "return_request_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "return_type" TEXT NOT NULL,
    "memo" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inbound_date" TEXT NOT NULL,
    "total_price" INTEGER NOT NULL,
    "order_no" TEXT,
    "batch_no" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "SupplierOrderReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierOrderReturnItem_return_request_id_idx" ON "SupplierOrderReturnItem"("return_request_id");

ALTER TABLE "SupplierOrderReturnItem" ADD CONSTRAINT "SupplierOrderReturnItem_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "SupplierOrderReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
