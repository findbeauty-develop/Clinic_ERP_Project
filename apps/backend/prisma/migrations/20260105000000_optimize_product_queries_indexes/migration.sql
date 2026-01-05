-- Add performance indexes for ProductSupplier and ReturnPolicy
-- These indexes optimize parallel queries in getAllProducts()

-- Index for ProductSupplier: tenant_id + product_id (used in parallel query)
CREATE INDEX IF NOT EXISTS "ProductSupplier_tenant_id_product_id_idx" 
ON "ProductSupplier"("tenant_id", "product_id");

-- Index for ReturnPolicy: tenant_id + product_id (used in parallel query)
CREATE INDEX IF NOT EXISTS "ReturnPolicy_tenant_id_product_id_idx" 
ON "ReturnPolicy"("tenant_id", "product_id");

-- Index for Batch: product_id + created_at + expiry_date (FEFO optimization)
CREATE INDEX IF NOT EXISTS "Batch_product_id_created_at_expiry_date_idx" 
ON "Batch"("product_id", "created_at", "expiry_date");

