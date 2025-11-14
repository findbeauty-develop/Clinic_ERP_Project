-- Handle NULL tenant_id values by updating them with a default tenant
-- Note: Replace 'self-service-tenant' with your actual default tenant ID if different
UPDATE "Product" SET "tenant_id" = 'self-service-tenant' WHERE "tenant_id" IS NULL;
UPDATE "ReturnPolicy" SET "tenant_id" = 'self-service-tenant' WHERE "tenant_id" IS NULL;
UPDATE "Batch" SET "tenant_id" = 'self-service-tenant' WHERE "tenant_id" IS NULL;
UPDATE "SupplierProduct" SET "tenant_id" = 'self-service-tenant' WHERE "tenant_id" IS NULL;

-- Make tenant_id NOT NULL
ALTER TABLE "Batch" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "ReturnPolicy" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "SupplierProduct" ALTER COLUMN "tenant_id" SET NOT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS "Batch_tenant_id_product_id_idx" ON "Batch"("tenant_id", "product_id");
CREATE INDEX IF NOT EXISTS "Product_tenant_id_idx" ON "Product"("tenant_id");
CREATE INDEX IF NOT EXISTS "ReturnPolicy_tenant_id_idx" ON "ReturnPolicy"("tenant_id");
CREATE INDEX IF NOT EXISTS "SupplierProduct_tenant_id_product_id_idx" ON "SupplierProduct"("tenant_id", "product_id");
