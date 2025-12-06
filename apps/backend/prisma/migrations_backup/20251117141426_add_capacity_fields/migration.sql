-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "capacity_per_product" INTEGER,
ADD COLUMN IF NOT EXISTS "capacity_unit" TEXT,
ADD COLUMN IF NOT EXISTS "usage_capacity" INTEGER;

