-- AlterTable
-- Add confirmed_unit_price: supplier tasdiqlagan narx (unit_price = clinic order narxi, o'zgarmas)
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "confirmed_unit_price" INTEGER;

-- Backfill: existing rows get confirmed_unit_price = unit_price so behaviour stays same until code uses it
UPDATE "OrderItem" SET "confirmed_unit_price" = "unit_price" WHERE "confirmed_unit_price" IS NULL;
