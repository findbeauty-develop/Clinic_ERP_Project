-- Add performance indexes for Return table to optimize queries
-- These indexes will speed up aggregate queries for returned quantities

-- Index for product_id + tenant_id (used in getReturnedQuantity)
CREATE INDEX IF NOT EXISTS "idx_return_product_tenant" ON "Return"("product_id", "tenant_id");

-- Index for outbound_id + tenant_id (used in getReturnedQuantityByOutbound)
CREATE INDEX IF NOT EXISTS "idx_return_outbound_tenant" ON "Return"("outbound_id", "tenant_id") WHERE "outbound_id" IS NOT NULL;

-- Index for batch_id + tenant_id (used in getReturnedQuantityByBatch)
CREATE INDEX IF NOT EXISTS "idx_return_batch_tenant" ON "Return"("batch_id", "tenant_id");

