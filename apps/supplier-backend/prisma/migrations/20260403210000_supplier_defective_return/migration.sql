-- Replace unused SupplierOrderReturn* with flat SupplierDefectiveReturn

DROP TABLE IF EXISTS "SupplierOrderReturnItem" CASCADE;
DROP TABLE IF EXISTS "SupplierOrderReturnRequest" CASCADE;

CREATE TABLE "SupplierDefectiveReturn" (
    "id" TEXT NOT NULL,
    "supplier_tenant_id" TEXT NOT NULL,
    "supplier_manager_id" TEXT,
    "clinic_tenant_id" TEXT NOT NULL,
    "clinic_name" TEXT NOT NULL,
    "clinic_manager_name" TEXT NOT NULL,
    "defective_return_no" TEXT NOT NULL,
    "defective_return_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "product_received" BOOLEAN NOT NULL DEFAULT false,
    "received_at" TIMESTAMP(3),
    "product_name" TEXT NOT NULL,
    "brand" TEXT,
    "total_qty" INTEGER NOT NULL,
    "total_price" INTEGER NOT NULL,
    "memo" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inbound_date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejected_reason" TEXT,

    CONSTRAINT "SupplierDefectiveReturn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierDefectiveReturn_defective_return_no_key" ON "SupplierDefectiveReturn"("defective_return_no");
CREATE INDEX "SupplierDefectiveReturn_supplier_tenant_id_idx" ON "SupplierDefectiveReturn"("supplier_tenant_id");
CREATE INDEX "SupplierDefectiveReturn_supplier_manager_id_idx" ON "SupplierDefectiveReturn"("supplier_manager_id");
CREATE INDEX "SupplierDefectiveReturn_clinic_tenant_id_idx" ON "SupplierDefectiveReturn"("clinic_tenant_id");
CREATE INDEX "SupplierDefectiveReturn_defective_return_no_idx" ON "SupplierDefectiveReturn"("defective_return_no");
CREATE INDEX "SupplierDefectiveReturn_status_idx" ON "SupplierDefectiveReturn"("status");
CREATE INDEX "SupplierDefectiveReturn_created_at_idx" ON "SupplierDefectiveReturn"("created_at");
