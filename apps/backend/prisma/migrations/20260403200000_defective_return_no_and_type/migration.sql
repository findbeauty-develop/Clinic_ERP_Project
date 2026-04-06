-- Merged: OrderReturn → DefectiveProductReturn (03180000) + defective_return_no / defective_return_type (03200000).
-- Run this once if you never applied the earlier split migrations.

-- ---------------------------------------------------------------------------
-- 1) OrderReturn → DefectiveProductReturn (주문 rows removed, columns dropped)
-- ---------------------------------------------------------------------------

ALTER TABLE "OrderReturn" ADD COLUMN IF NOT EXISTS "supplier_manager_id" TEXT;

UPDATE "OrderReturn"
SET "supplier_manager_id" = "supplier_id"
WHERE "supplier_manager_id" IS NULL AND "supplier_id" IS NOT NULL;

DELETE FROM "OrderReturn" WHERE "order_id" IS NOT NULL;

ALTER TABLE "OrderReturn" DROP COLUMN IF EXISTS "order_id";
ALTER TABLE "OrderReturn" DROP COLUMN IF EXISTS "order_no";
ALTER TABLE "OrderReturn" DROP COLUMN IF EXISTS "outbound_id";
ALTER TABLE "OrderReturn" DROP COLUMN IF EXISTS "return_no";
ALTER TABLE "OrderReturn" DROP COLUMN IF EXISTS "batch_no";
ALTER TABLE "OrderReturn" DROP COLUMN IF EXISTS "supplier_id";

ALTER TABLE "OrderReturn" RENAME TO "DefectiveProductReturn";

DROP INDEX IF EXISTS "OrderReturn_tenant_id_idx";
DROP INDEX IF EXISTS "OrderReturn_order_id_idx";
DROP INDEX IF EXISTS "OrderReturn_outbound_id_idx";
DROP INDEX IF EXISTS "OrderReturn_return_no_idx";
DROP INDEX IF EXISTS "OrderReturn_status_idx";
DROP INDEX IF EXISTS "OrderReturn_tenant_id_status_idx";
DROP INDEX IF EXISTS "OrderReturn_return_type_idx";

CREATE INDEX "DefectiveProductReturn_tenant_id_idx" ON "DefectiveProductReturn"("tenant_id");
CREATE INDEX "DefectiveProductReturn_supplier_manager_id_idx" ON "DefectiveProductReturn"("supplier_manager_id");
CREATE INDEX "DefectiveProductReturn_status_idx" ON "DefectiveProductReturn"("status");
CREATE INDEX "DefectiveProductReturn_tenant_id_status_idx" ON "DefectiveProductReturn"("tenant_id", "status");

-- Old OrderReturn.supplier_id was not always ClinicSupplierManager.id; drop invalid FK targets
UPDATE "DefectiveProductReturn" d
SET "supplier_manager_id" = NULL
WHERE d."supplier_manager_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ClinicSupplierManager" c
    WHERE c.id = d."supplier_manager_id"
      AND c.tenant_id = d."tenant_id"
  );

ALTER TABLE "DefectiveProductReturn"
  ADD CONSTRAINT "DefectiveProductReturn_supplier_manager_id_fkey"
  FOREIGN KEY ("supplier_manager_id") REFERENCES "ClinicSupplierManager"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2) return_type → defective_return_type (enum) + defective_return_no
-- ---------------------------------------------------------------------------

CREATE TYPE "DefectiveReturnType" AS ENUM ('defective_exchange', 'defective_return');

ALTER TABLE "DefectiveProductReturn" ADD COLUMN "defective_return_no" TEXT;
ALTER TABLE "DefectiveProductReturn" ADD COLUMN "defective_return_type" "DefectiveReturnType";

UPDATE "DefectiveProductReturn"
SET "defective_return_type" = CASE
  WHEN "return_type" LIKE '%교환%' THEN 'defective_exchange'::"DefectiveReturnType"
  ELSE 'defective_return'::"DefectiveReturnType"
END;

DO $$
DECLARE
  r RECORD;
  new_no TEXT;
  attempts INT;
  done BOOLEAN;
BEGIN
  FOR r IN SELECT id, created_at FROM "DefectiveProductReturn" WHERE "defective_return_no" IS NULL
  LOOP
    attempts := 0;
    done := FALSE;
    WHILE NOT done AND attempts < 30 LOOP
      new_no := 'B' || to_char(r.created_at AT TIME ZONE 'UTC', 'YYYYMMDD')
        || LPAD((floor(random() * 900000) + 100000)::INT::TEXT, 6, '0');
      IF NOT EXISTS (SELECT 1 FROM "DefectiveProductReturn" x WHERE x."defective_return_no" = new_no) THEN
        UPDATE "DefectiveProductReturn" SET "defective_return_no" = new_no WHERE id = r.id;
        done := TRUE;
      END IF;
      attempts := attempts + 1;
    END LOOP;
    IF NOT done THEN
      UPDATE "DefectiveProductReturn"
      SET "defective_return_no" = 'B' || REPLACE(id::TEXT, '-', '')
      WHERE id = r.id AND "defective_return_no" IS NULL;
    END IF;
  END LOOP;
END $$;

ALTER TABLE "DefectiveProductReturn" ALTER COLUMN "defective_return_no" SET NOT NULL;
ALTER TABLE "DefectiveProductReturn" ALTER COLUMN "defective_return_type" SET NOT NULL;

CREATE UNIQUE INDEX "DefectiveProductReturn_defective_return_no_key" ON "DefectiveProductReturn"("defective_return_no");

DROP INDEX IF EXISTS "DefectiveProductReturn_return_type_idx";

ALTER TABLE "DefectiveProductReturn" DROP COLUMN "return_type";

CREATE INDEX "DefectiveProductReturn_defective_return_type_idx" ON "DefectiveProductReturn"("defective_return_type");
