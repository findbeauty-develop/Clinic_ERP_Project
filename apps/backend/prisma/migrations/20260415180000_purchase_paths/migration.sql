-- 구매 경로 (PurchasePath) + OrderItem snapshot columns

CREATE TYPE "PurchasePathType" AS ENUM ('MANAGER', 'SITE', 'OTHER');

CREATE TABLE "PurchasePath" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "path_type" "PurchasePathType" NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "clinic_supplier_manager_id" TEXT,
    "site_name" TEXT,
    "site_url" TEXT,
    "normalized_domain" TEXT,
    "other_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchasePath_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchasePath_tenant_id_idx" ON "PurchasePath"("tenant_id");
CREATE INDEX "PurchasePath_product_id_idx" ON "PurchasePath"("product_id");
CREATE INDEX "PurchasePath_product_id_path_type_idx" ON "PurchasePath"("product_id", "path_type");
CREATE INDEX "PurchasePath_tenant_id_product_id_idx" ON "PurchasePath"("tenant_id", "product_id");

ALTER TABLE "PurchasePath" ADD CONSTRAINT "PurchasePath_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchasePath" ADD CONSTRAINT "PurchasePath_clinic_supplier_manager_id_fkey"
  FOREIGN KEY ("clinic_supplier_manager_id") REFERENCES "ClinicSupplierManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD COLUMN "purchase_path_id" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "purchase_path_type" "PurchasePathType";
ALTER TABLE "OrderItem" ADD COLUMN "purchase_path_snapshot" JSONB;

CREATE INDEX "OrderItem_purchase_path_id_idx" ON "OrderItem"("purchase_path_id");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_purchase_path_id_fkey"
  FOREIGN KEY ("purchase_path_id") REFERENCES "PurchasePath"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same product + same normalized domain for SITE paths only
CREATE UNIQUE INDEX "PurchasePath_product_site_domain_key"
  ON "PurchasePath" ("product_id", "normalized_domain")
  WHERE "path_type" = 'SITE' AND "normalized_domain" IS NOT NULL;
