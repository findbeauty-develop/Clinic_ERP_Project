-- Migration already applied via prisma db push
-- Add inbound_manager column to Product table
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "inbound_manager" TEXT;
