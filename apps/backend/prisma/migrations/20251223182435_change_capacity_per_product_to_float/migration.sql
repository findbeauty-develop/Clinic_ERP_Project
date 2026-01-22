-- Migration already applied via prisma db push
-- This is a placeholder migration file
-- Original migration: Change capacity_per_product from INTEGER to DOUBLE PRECISION
ALTER TABLE "Product" ALTER COLUMN "capacity_per_product" TYPE DOUBLE PRECISION;
