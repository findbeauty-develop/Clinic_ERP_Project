-- Snapshot at exchange-inbound expectation time (stable display if catalog changes later)
ALTER TABLE "DefectiveExchangeInboundExpectation" ADD COLUMN IF NOT EXISTS "product_name" TEXT;
ALTER TABLE "DefectiveExchangeInboundExpectation" ADD COLUMN IF NOT EXISTS "brand" TEXT;

UPDATE "DefectiveExchangeInboundExpectation" AS e
SET
  "product_name" = r."product_name",
  "brand" = r."brand"
FROM "DefectiveProductReturn" AS r
WHERE e."defective_product_return_id" = r."id"
  AND e."product_name" IS NULL;
