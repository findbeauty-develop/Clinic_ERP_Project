-- Add inbound_manager column to Batch table
-- Run this SQL directly in your database (Supabase SQL Editor or psql)

ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "inbound_manager" TEXT;

