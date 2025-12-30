-- Add performance indexes for created_at columns
-- These indexes optimize orderBy queries on Product and Batch tables

-- Product table: Optimize orderBy created_at DESC queries filtered by tenant_id
CREATE INDEX IF NOT EXISTS "Product_tenant_id_created_at_idx" ON "Product"("tenant_id", "created_at" DESC);

-- Batch table: Optimize orderBy created_at DESC queries filtered by product_id
CREATE INDEX IF NOT EXISTS "Batch_product_id_created_at_idx" ON "Batch"("product_id", "created_at" DESC);

