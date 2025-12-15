-- Add privacy and disclosure settings to Clinic table
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "allow_company_search" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "allow_info_disclosure" BOOLEAN NOT NULL DEFAULT false;

