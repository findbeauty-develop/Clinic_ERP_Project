-- SupplierTipReturnRequest — hozirgi Prisma schema (2026-04) bilan mos.
-- Avvalgi split-migratsiyalarsiz to‘g‘ridan-to‘g‘ri ishga tushirish uchun.
-- PostgreSQL. Takroriy ishlatish: avval mavjud jadvalni DROP qiling yoki faqat yangi DBda ishlating.

CREATE TABLE IF NOT EXISTS "SupplierTipReturnRequest" (
    "id" TEXT NOT NULL,
    "supplier_tenant_id" TEXT NOT NULL,
    "supplier_manager_id" TEXT,
    "clinic_tenant_id" TEXT NOT NULL,
    "clinic_name" TEXT NOT NULL,
    "clinic_manager_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "product_name" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" INTEGER NOT NULL,
    "return_type" TEXT NOT NULL,
    "tip_return_price" INTEGER NOT NULL,
    "quantity_change_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "SupplierTipReturnRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplierTipReturnRequest_supplier_tenant_id_idx"
    ON "SupplierTipReturnRequest" ("supplier_tenant_id");
CREATE INDEX IF NOT EXISTS "SupplierTipReturnRequest_supplier_manager_id_idx"
    ON "SupplierTipReturnRequest" ("supplier_manager_id");
CREATE INDEX IF NOT EXISTS "SupplierTipReturnRequest_clinic_tenant_id_idx"
    ON "SupplierTipReturnRequest" ("clinic_tenant_id");
CREATE INDEX IF NOT EXISTS "SupplierTipReturnRequest_status_idx"
    ON "SupplierTipReturnRequest" ("status");
CREATE INDEX IF NOT EXISTS "SupplierTipReturnRequest_created_at_idx"
    ON "SupplierTipReturnRequest" ("created_at");
