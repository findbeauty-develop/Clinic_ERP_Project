-- CreateTable
CREATE TABLE "ProductGTIN" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "gtin" TEXT NOT NULL,

    CONSTRAINT "ProductGTIN_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductGTIN_tenant_id_gtin_key" ON "ProductGTIN"("tenant_id", "gtin");

-- CreateIndex
CREATE INDEX "ProductGTIN_tenant_id_idx" ON "ProductGTIN"("tenant_id");

-- CreateIndex
CREATE INDEX "ProductGTIN_product_id_idx" ON "ProductGTIN"("product_id");

-- AddForeignKey
ALTER TABLE "ProductGTIN" ADD CONSTRAINT "ProductGTIN_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: copy Product.barcode to ProductGTIN (one row per tenant_id + barcode, keep first product if duplicate)
INSERT INTO "ProductGTIN" ("id", "tenant_id", "product_id", "gtin")
SELECT
  gen_random_uuid(),
  "tenant_id",
  "id",
  TRIM("barcode")
FROM (
  SELECT "tenant_id", "id", "barcode",
    ROW_NUMBER() OVER (PARTITION BY "tenant_id", TRIM("barcode") ORDER BY "created_at" ASC) AS rn
  FROM "Product"
  WHERE "barcode" IS NOT NULL AND TRIM("barcode") != ''
) sub
WHERE rn = 1
ON CONFLICT ("tenant_id", "gtin") DO NOTHING;
