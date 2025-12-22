-- ============================================================
-- STEP 2: SCHEMA CLEANUP
-- Production-safe migration: FK'larni o'chirish va column'larni tozalash
-- ============================================================
-- 
-- EHTIYOT: Bu migration faqat Step 1 muvaffaqiyatli o'tganidan keyin ishga tushirilishi kerak!
-- ============================================================

-- ============================================================
-- PART 1: Product table'dan FK'larni o'chirish
-- ============================================================

-- Step 1.1: Index'larni o'chirish
DROP INDEX IF EXISTS "Product_supplier_manager_id_idx";
DROP INDEX IF EXISTS "Product_clinic_supplier_link_id_idx";

-- Step 1.2: FK constraint'larni o'chirish
ALTER TABLE "Product" 
  DROP CONSTRAINT IF EXISTS "Product_supplier_manager_id_fkey",
  DROP CONSTRAINT IF EXISTS "Product_clinic_supplier_link_id_fkey";

-- Step 1.3: Column'larni o'chirish
ALTER TABLE "Product"
  DROP COLUMN IF EXISTS "supplier_manager_id",
  DROP COLUMN IF EXISTS "clinic_supplier_link_id";

-- ============================================================
-- PART 2: ClinicSupplierManager'dan supplier_id FK'ni o'chirish
-- ============================================================

-- Step 2.1: Index o'chirish
DROP INDEX IF EXISTS "ClinicSupplierManager_supplier_id_idx";

-- Step 2.2: FK constraint o'chirish
ALTER TABLE "ClinicSupplierManager"
  DROP CONSTRAINT IF EXISTS "ClinicSupplierManager_supplier_id_fkey";

-- Step 2.3: Column o'chirish
ALTER TABLE "ClinicSupplierManager"
  DROP COLUMN IF EXISTS "supplier_id";

-- Step 2.4: company_name NOT NULL qilish (agar NULL bo'lsa, default qo'yish)
UPDATE "ClinicSupplierManager"
SET company_name = '공급업체 없음'
WHERE company_name IS NULL;

ALTER TABLE "ClinicSupplierManager"
  ALTER COLUMN "company_name" SET NOT NULL;

-- ============================================================
-- PART 3: ProductSupplier'ga FK constraint'lar qo'shish
-- ============================================================

-- Step 3.1: Product FK
ALTER TABLE "ProductSupplier"
  ADD CONSTRAINT "ProductSupplier_product_id_fkey" 
  FOREIGN KEY ("product_id") 
  REFERENCES "Product"("id") 
  ON DELETE CASCADE;

-- Step 3.2: ClinicSupplierManager FK
ALTER TABLE "ProductSupplier"
  ADD CONSTRAINT "ProductSupplier_clinic_supplier_manager_id_fkey" 
  FOREIGN KEY ("clinic_supplier_manager_id") 
  REFERENCES "ClinicSupplierManager"("id") 
  ON DELETE CASCADE;

-- Step 3.3: clinic_supplier_manager_id NOT NULL qilish
ALTER TABLE "ProductSupplier"
  ALTER COLUMN "clinic_supplier_manager_id" SET NOT NULL;

-- ============================================================
-- PART 4: ClinicSupplierLink'ga FK constraint qo'shish
-- ============================================================

-- Step 4.1: ClinicSupplierManager FK (optional)
ALTER TABLE "ClinicSupplierLink"
  ADD CONSTRAINT "ClinicSupplierLink_clinic_supplier_manager_id_fkey" 
  FOREIGN KEY ("clinic_supplier_manager_id") 
  REFERENCES "ClinicSupplierManager"("id") 
  ON DELETE SET NULL;

-- ============================================================
-- PART 5: SupplierManager'ga relation qo'shish
-- ============================================================

-- Step 5.1: ClinicSupplierManager'ga FK constraint qo'shish (linked_supplier_manager_id)
ALTER TABLE "ClinicSupplierManager"
  ADD CONSTRAINT "ClinicSupplierManager_linked_supplier_manager_id_fkey" 
  FOREIGN KEY ("linked_supplier_manager_id") 
  REFERENCES "SupplierManager"("id") 
  ON DELETE SET NULL;

-- ============================================================
-- PART 6: Validation
-- ============================================================

DO $$
DECLARE
  products_without_supplier INTEGER;
  clinic_managers_without_company INTEGER;
BEGIN
  -- Validation: Barcha Product'lar uchun ProductSupplier bo'lishi kerak
  SELECT COUNT(*) INTO products_without_supplier
  FROM "Product" p
  WHERE NOT EXISTS (
    SELECT 1 FROM "ProductSupplier" ps WHERE ps.product_id = p.id
  );
  
  -- Validation: Barcha ClinicSupplierManager'larda company_name bo'lishi kerak
  SELECT COUNT(*) INTO clinic_managers_without_company
  FROM "ClinicSupplierManager"
  WHERE company_name IS NULL;
  
  RAISE NOTICE '=== Migration Step 2 Complete ===';
  RAISE NOTICE 'Products without ProductSupplier: %', products_without_supplier;
  RAISE NOTICE 'ClinicSupplierManager without company_name: %', clinic_managers_without_company;
  
  IF products_without_supplier > 0 THEN
    RAISE WARNING 'Some products do not have ProductSupplier mapping!';
  END IF;
  
  IF clinic_managers_without_company > 0 THEN
    RAISE WARNING 'Some ClinicSupplierManager records are missing company_name!';
  END IF;
END $$;