-- Tip return: single table per request (no SupplierTipReturnItem).

ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "product_name" TEXT;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "quantity" INTEGER;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "return_type" TEXT;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "tip_return_price" INTEGER;
ALTER TABLE "SupplierTipReturnRequest" ADD COLUMN IF NOT EXISTS "quantity_change_reason" TEXT;

-- Copy from legacy line table when present (first item per request)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'SupplierTipReturnItem'
  ) THEN
    UPDATE "SupplierTipReturnRequest" r
    SET
      "product_name" = i."product_name",
      "brand" = i."brand",
      "quantity" = i."quantity",
      "return_type" = i."return_type",
      "tip_return_price" = i."tip_return_price",
      "quantity_change_reason" = i."quantity_change_reason"
    FROM (
      SELECT DISTINCT ON ("return_request_id")
        "return_request_id",
        "product_name",
        "brand",
        "quantity",
        "return_type",
        "tip_return_price",
        "quantity_change_reason"
      FROM "SupplierTipReturnItem"
      ORDER BY "return_request_id", "created_at" ASC
    ) AS i
    WHERE r.id = i."return_request_id";
  END IF;
END $$;

-- Fallback for rows that never had an item row (should be rare)
UPDATE "SupplierTipReturnRequest"
SET
  "product_name" = COALESCE("product_name", '알 수 없음'),
  "quantity" = COALESCE("quantity", 0),
  "return_type" = COALESCE("return_type", '반납'),
  "tip_return_price" = COALESCE("tip_return_price", 0)
WHERE "product_name" IS NULL OR "quantity" IS NULL OR "return_type" IS NULL OR "tip_return_price" IS NULL;

ALTER TABLE "SupplierTipReturnRequest" ALTER COLUMN "product_name" SET NOT NULL;
ALTER TABLE "SupplierTipReturnRequest" ALTER COLUMN "quantity" SET NOT NULL;
ALTER TABLE "SupplierTipReturnRequest" ALTER COLUMN "return_type" SET NOT NULL;
ALTER TABLE "SupplierTipReturnRequest" ALTER COLUMN "tip_return_price" SET NOT NULL;

DROP TABLE IF EXISTS "SupplierTipReturnItem";
