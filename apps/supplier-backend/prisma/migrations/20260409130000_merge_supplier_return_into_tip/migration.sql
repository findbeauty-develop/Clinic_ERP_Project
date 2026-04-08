-- Replace SupplierReturnRequest + SupplierReturnItem with flat SupplierTipReturnRequest rows (grouped by return_no).

ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "return_no" TEXT;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "memo" TEXT;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "images" TEXT[];
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "inbound_date" TEXT;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "order_no" TEXT;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "batch_no" TEXT;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "product_id" TEXT;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3);
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "rejected_reason" TEXT;

UPDATE "SupplierTipReturnRequest" SET "images" = ARRAY[]::TEXT[] WHERE "images" IS NULL;
UPDATE "SupplierTipReturnRequest" SET "return_no" = 'TIP-' || "id" WHERE "return_no" IS NULL OR TRIM("return_no") = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'SupplierReturnItem'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'SupplierReturnRequest'
  ) THEN
    INSERT INTO "SupplierTipReturnRequest" (
      "id",
      "return_no",
      "supplier_tenant_id",
      "supplier_manager_id",
      "clinic_tenant_id",
      "clinic_name",
      "clinic_manager_name",
      "status",
      "product_name",
      "brand",
      "quantity",
      "return_type",
      "tip_return_price",
      "quantity_change_reason",
      "memo",
      "images",
      "inbound_date",
      "order_no",
      "batch_no",
      "product_id",
      "created_at",
      "updated_at",
      "confirmed_at",
      "completed_at",
      "rejected_at",
      "rejected_reason"
    )
    SELECT
      gen_random_uuid(),
      r."return_no",
      r."supplier_tenant_id",
      r."supplier_manager_id",
      r."clinic_tenant_id",
      r."clinic_name",
      r."clinic_manager_name",
      CASE
        WHEN r."status" = 'rejected' THEN 'rejected'
        WHEN r."status" = 'completed' THEN 'completed'
        WHEN r."status" = 'processing' THEN COALESCE(NULLIF(TRIM(i."status"), ''), 'processing')
        ELSE COALESCE(NULLIF(TRIM(i."status"), ''), 'pending')
      END,
      i."product_name",
      i."brand",
      i."quantity",
      i."return_type",
      i."total_price",
      NULL,
      i."memo",
      COALESCE(i."images", ARRAY[]::TEXT[]),
      i."inbound_date",
      i."order_no",
      i."batch_no",
      NULL,
      COALESCE(i."created_at", r."created_at"),
      i."updated_at",
      r."confirmed_at",
      r."completed_at",
      r."rejected_at",
      r."rejected_reason"
    FROM "SupplierReturnItem" i
    INNER JOIN "SupplierReturnRequest" r ON r."id" = i."return_request_id";
  END IF;
END $$;

ALTER TABLE "SupplierTipReturnRequest" ALTER COLUMN "return_no" SET NOT NULL;
ALTER TABLE "SupplierTipReturnRequest" ALTER COLUMN "images" SET NOT NULL;
ALTER TABLE "SupplierTipReturnRequest" ALTER COLUMN "images" SET DEFAULT ARRAY[]::TEXT[];

DROP TABLE IF EXISTS "SupplierReturnItem";
DROP TABLE IF EXISTS "SupplierReturnRequest";

CREATE INDEX IF NOT EXISTS "SupplierTipReturnRequest_return_no_idx" ON "SupplierTipReturnRequest"("return_no");
CREATE INDEX IF NOT EXISTS "SupplierTipReturnRequest_supplier_tenant_id_return_no_idx" ON "SupplierTipReturnRequest"("supplier_tenant_id", "return_no");
