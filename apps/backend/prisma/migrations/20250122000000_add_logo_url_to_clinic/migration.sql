-- Add logo_url column to Clinic table
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "logo_url" TEXT;