-- AlterTable
ALTER TABLE "Outbound" ADD COLUMN IF NOT EXISTS "waste_product" BOOLEAN NOT NULL DEFAULT false;
