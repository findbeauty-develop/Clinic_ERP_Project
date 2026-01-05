-- Add composite index for getPendingInboundOrders query optimization
-- This index speeds up queries filtering by tenant_id, status, and ordering by confirmed_at
CREATE INDEX IF NOT EXISTS "Order_tenant_id_status_confirmed_at_idx" ON "Order"("tenant_id", "status", "confirmed_at" DESC);

