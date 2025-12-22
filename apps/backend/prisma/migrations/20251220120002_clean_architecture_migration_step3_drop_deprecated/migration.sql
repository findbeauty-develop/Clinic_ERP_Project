-- ============================================================
-- STEP 3: DROP DEPRECATED TABLE (OPTIONAL - Run after verifying everything works)
-- ============================================================
-- 
-- EHTIYOT: Bu migration faqat Step 1 va Step 2 muvaffaqiyatli o'tganidan keyin ishga tushirilishi kerak!
-- Production'da bir necha hafta kutib, keyin drop qilish tavsiya etiladi.
-- ============================================================

-- ============================================================
-- PART 1: Validation - ProductSupplier'da barcha data borligini tekshirish
-- ============================================================

DO $$
DECLARE
  total_products INTEGER;
  products_with_supplier INTEGER;
  supplier_products_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_products FROM "Product";
  SELECT COUNT(*) INTO products_with_supplier 
  FROM "ProductSupplier";
  SELECT COUNT(*) INTO supplier_products_count 
  FROM "SupplierProduct";
  
  RAISE NOTICE '=== Pre-drop Validation ===';
  RAISE NOTICE 'Total products: %', total_products;
  RAISE NOTICE 'Products with ProductSupplier: %', products_with_supplier;
  RAISE NOTICE 'SupplierProduct records: %', supplier_products_count;
  
  -- Validation: Barcha Product'lar uchun ProductSupplier bo'lishi kerak
  IF products_with_supplier < total_products THEN
    RAISE EXCEPTION 'Cannot drop SupplierProduct: Some products do not have ProductSupplier mapping!';
  END IF;
  
  RAISE NOTICE 'Validation passed. Proceeding with drop...';
END $$;

-- ============================================================
-- PART 2: SupplierProduct table'ni drop qilish
-- ============================================================

-- Step 2.1: Index'larni o'chirish
DROP INDEX IF EXISTS "SupplierProduct_tenant_id_idx";
DROP INDEX IF EXISTS "SupplierProduct_product_id_idx";
DROP INDEX IF EXISTS "SupplierProduct_supplier_id_idx";
DROP INDEX IF EXISTS "SupplierProduct_supplier_manager_id_idx";
DROP INDEX IF EXISTS "SupplierProduct_supplier_tenant_id_idx";
DROP INDEX IF EXISTS "SupplierProduct_tenant_product_idx";

-- Step 2.2: FK constraint'ni o'chirish
ALTER TABLE "SupplierProduct"
  DROP CONSTRAINT IF EXISTS "SupplierProduct_product_id_fkey";

-- Step 2.3: Table'ni o'chirish
DROP TABLE IF EXISTS "SupplierProduct";

-- ============================================================
-- PART 3: Final validation
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '=== Migration Step 3 Complete ===';
  RAISE NOTICE 'SupplierProduct table has been dropped successfully.';
  RAISE NOTICE 'All product-supplier mappings are now in ProductSupplier table.';
END $$;