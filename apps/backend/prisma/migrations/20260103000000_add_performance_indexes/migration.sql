-- Add performance indexes for Product and Batch tables
-- These indexes optimize getAllProducts query with orderBy created_at

-- Index for Product: tenant_id + created_at (used in getAllProducts with orderBy)
CREATE INDEX IF NOT EXISTS "Product_tenant_id_created_at_idx" ON "Product"("tenant_id", "created_at");

-- Index for Batch: product_id + created_at (used in batch queries with orderBy)
CREATE INDEX IF NOT EXISTS "Batch_product_id_created_at_idx" ON "Batch"("product_id", "created_at");

