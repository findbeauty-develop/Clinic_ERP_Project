-- ============================================================
-- ROLLBACK STRATEGY
-- ============================================================
-- 
-- EHTIYOT: Bu rollback script faqat emergency holatda ishlatilishi kerak!
-- Production'da rollback qilishdan oldin backup olishni unutmang!
-- ============================================================

-- ============================================================
-- STEP 1: Product table'ga eski column'lar qaytarish
-- ============================================================

-- Step 1.1: Column'lar qo'shish
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "supplier_manager_id" TEXT,
  ADD COLUMN IF NOT EXISTS "clinic_supplier_link_id" TEXT;

-- Step 1.2: Index'lar qo'shish
CREATE INDEX IF NOT EXISTS "Product_supplier_manager_id_idx" 
ON "Product"("supplier_manager_id");

CREATE INDEX IF NOT EXISTS "Product_clinic_supplier_link_id_idx" 
ON "Product"("clinic_supplier_link_id");

-- Step 1.3: Data restore qilish (ProductSupplier'dan)
UPDATE "Product" p
SET supplier_manager_id = (
  SELECT csm.linked_supplier_manager_id
  FROM "ProductSupplier" ps
  JOIN "ClinicSupplierManager" csm ON ps.clinic_supplier_manager_id = csm.id
  WHERE ps.product_id = p.id
    AND csm.linked_supplier_manager_id IS NOT NULL
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM "ProductSupplier" ps WHERE ps.product_id = p.id
);

-- ============================================================
-- STEP 2: ClinicSupplierManager'ga supplier_id qaytarish
-- ============================================================

-- Step 2.1: Column qo'shish
ALTER TABLE "ClinicSupplierManager"
  ADD COLUMN IF NOT EXISTS "supplier_id" TEXT;

-- Step 2.2: Index qo'shish
CREATE INDEX IF NOT EXISTS "ClinicSupplierManager_supplier_id_idx" 
ON "ClinicSupplierManager"("supplier_id");

-- Step 2.3: Data restore qilish (linked_supplier_manager_id orqali)
UPDATE "ClinicSupplierManager" csm
SET supplier_id = (
  SELECT s.id
  FROM "SupplierManager" sm
  JOIN "Supplier" s ON sm.supplier_tenant_id = s.tenant_id
  WHERE sm.id = csm.linked_supplier_manager_id
  LIMIT 1
)
WHERE csm.linked_supplier_manager_id IS NOT NULL
  AND csm.supplier_id IS NULL;

-- ============================================================
-- STEP 3: FK constraint'lar qaytarish
-- ============================================================

-- Step 3.1: Product → SupplierManager FK
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_supplier_manager_id_fkey" 
  FOREIGN KEY ("supplier_manager_id") 
  REFERENCES "SupplierManager"("id") 
  ON DELETE SET NULL;

-- Step 3.2: Product → ClinicSupplierLink FK
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_clinic_supplier_link_id_fkey" 
  FOREIGN KEY ("clinic_supplier_link_id") 
  REFERENCES "ClinicSupplierLink"("id") 
  ON DELETE SET NULL;

-- Step 3.3: ClinicSupplierManager → Supplier FK
ALTER TABLE "ClinicSupplierManager"
  ADD CONSTRAINT "ClinicSupplierManager_supplier_id_fkey" 
  FOREIGN KEY ("supplier_id") 
  REFERENCES "Supplier"("id") 
  ON DELETE CASCADE;

-- ============================================================
-- STEP 4: SupplierProduct table'ni qaytarish (agar drop qilingan bo'lsa)
-- ============================================================

-- Step 4.1: Table yaratish
CREATE TABLE IF NOT EXISTS "SupplierProduct" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  supplier_id TEXT,
  supplier_manager_id TEXT,
  purchase_price INTEGER,
  moq INTEGER,
  lead_time_days INTEGER,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  supplier_tenant_id TEXT,
  company_name TEXT
);

-- Step 4.2: FK constraint
ALTER TABLE "SupplierProduct"
  ADD CONSTRAINT "SupplierProduct_product_id_fkey" 
  FOREIGN KEY ("product_id") 
  REFERENCES "Product"("id") 
  ON DELETE CASCADE;

-- Step 4.3: Index'lar
CREATE INDEX IF NOT EXISTS "SupplierProduct_tenant_id_idx" 
ON "SupplierProduct"("tenant_id");

CREATE INDEX IF NOT EXISTS "SupplierProduct_product_id_idx" 
ON "SupplierProduct"("product_id");

CREATE INDEX IF NOT EXISTS "SupplierProduct_supplier_id_idx" 
ON "SupplierProduct"("supplier_id");

CREATE INDEX IF NOT EXISTS "SupplierProduct_supplier_manager_id_idx" 
ON "SupplierProduct"("supplier_manager_id");

CREATE INDEX IF NOT EXISTS "SupplierProduct_supplier_tenant_id_idx" 
ON "SupplierProduct"("supplier_tenant_id");

CREATE INDEX IF NOT EXISTS "SupplierProduct_tenant_product_idx" 
ON "SupplierProduct"("tenant_id", "product_id");

-- Step 4.4: Data restore qilish (ProductSupplier'dan)
INSERT INTO "SupplierProduct" (
  tenant_id,
  product_id,
  supplier_manager_id,
  purchase_price,
  moq,
  lead_time_days,
  note,
  created_at,
  updated_at,
  contact_name,
  contact_phone,
  contact_email,
  company_name
)
SELECT 
  ps.tenant_id,
  ps.product_id,
  csm.linked_supplier_manager_id as supplier_manager_id,
  ps.purchase_price,
  ps.moq,
  ps.lead_time_days,
  ps.note,
  ps.created_at,
  ps.updated_at,
  csm.name as contact_name,
  csm.phone_number as contact_phone,
  csm.email1 as contact_email,
  csm.company_name
FROM "ProductSupplier" ps
JOIN "ClinicSupplierManager" csm ON ps.clinic_supplier_manager_id = csm.id
ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 5: Validation
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '=== Rollback Complete ===';
  RAISE NOTICE 'Please verify data integrity manually.';
  RAISE NOTICE 'ProductSupplier table can be kept for reference or dropped later.';
END $$;


