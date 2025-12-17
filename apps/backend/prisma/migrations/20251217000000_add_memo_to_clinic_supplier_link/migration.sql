-- Add memo field to ClinicSupplierLink
ALTER TABLE "ClinicSupplierLink" ADD COLUMN IF NOT EXISTS "memo" TEXT;

