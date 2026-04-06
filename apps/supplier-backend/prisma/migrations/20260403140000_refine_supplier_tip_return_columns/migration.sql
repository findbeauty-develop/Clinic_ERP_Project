-- Refine SupplierTip* tables if 20260403120000 was already applied with the previous shape.
-- Safe on fresh DBs: IF EXISTS guards.

-- SupplierTipReturnRequest: drop removed columns and unique on return_no
DROP INDEX IF EXISTS "SupplierTipReturnRequest_return_no_key";
DROP INDEX IF EXISTS "SupplierTipReturnRequest_return_no_idx";

ALTER TABLE "SupplierTipReturnRequest" DROP COLUMN IF EXISTS "return_no";
ALTER TABLE "SupplierTipReturnRequest" DROP COLUMN IF EXISTS "memo";
ALTER TABLE "SupplierTipReturnRequest" DROP COLUMN IF EXISTS "rejected_at";
ALTER TABLE "SupplierTipReturnRequest" DROP COLUMN IF EXISTS "rejected_reason";

-- SupplierTipReturnItem: drop columns, replace total_price with tip_return_price
ALTER TABLE "SupplierTipReturnItem" DROP COLUMN IF EXISTS "memo";
ALTER TABLE "SupplierTipReturnItem" DROP COLUMN IF EXISTS "images";
ALTER TABLE "SupplierTipReturnItem" DROP COLUMN IF EXISTS "inbound_date";
ALTER TABLE "SupplierTipReturnItem" DROP COLUMN IF EXISTS "order_no";
ALTER TABLE "SupplierTipReturnItem" DROP COLUMN IF EXISTS "batch_no";

ALTER TABLE "SupplierTipReturnItem" ADD COLUMN IF NOT EXISTS "tip_return_price" INTEGER;

-- Copy total_price → tip_return_price only when legacy column exists (old 20260403120000 shape)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SupplierTipReturnItem'
      AND column_name = 'total_price'
  ) THEN
    UPDATE "SupplierTipReturnItem"
    SET "tip_return_price" = COALESCE("tip_return_price", "total_price", 0);
  END IF;
END $$;

ALTER TABLE "SupplierTipReturnItem" DROP COLUMN IF EXISTS "total_price";

ALTER TABLE "SupplierTipReturnItem" ALTER COLUMN "tip_return_price" SET NOT NULL;
