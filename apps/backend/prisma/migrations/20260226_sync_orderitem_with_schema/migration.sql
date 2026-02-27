-- Migration: Sync production OrderItem table with develop/schema
-- Production'da quantity ustuni NOT NULL qolgan, ordered_quantity esa nullable.
-- Maqsad: schema bilan bir xil qilish (quantity yo'q, ordered_quantity NOT NULL).

-- Step 1: Agar ordered_quantity NULL bo'lsa, quantity dan to'ldirish (production'da quantity mavjud bo'lsa)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'OrderItem' AND column_name = 'quantity'
  ) THEN
    UPDATE "OrderItem"
    SET ordered_quantity = COALESCE("quantity", 0)
    WHERE ordered_quantity IS NULL;
  END IF;
END $$;

-- Step 2: ordered_quantity hali NULL bo'lsa, confirmed_quantity yoki 0 dan to'ldirish
UPDATE "OrderItem"
SET ordered_quantity = COALESCE(confirmed_quantity, 0)
WHERE ordered_quantity IS NULL;

-- Step 3: ordered_quantity ni NOT NULL qilish
ALTER TABLE "OrderItem"
  ALTER COLUMN "ordered_quantity" SET NOT NULL;

-- Step 4: quantity ustunini o'chirish (schema'da yo'q; Prisma faqat ordered_quantity yozadi)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'OrderItem' AND column_name = 'quantity'
  ) THEN
    ALTER TABLE "OrderItem" DROP COLUMN "quantity";
  END IF;
END $$;
