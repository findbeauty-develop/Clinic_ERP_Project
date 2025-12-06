-- Add inbound_manager column to Batch table
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "inbound_manager" TEXT;

