-- ============================================================
-- STEP 1: DATA MIGRATION
-- Production-safe migration: Avval data migrate qilish
-- ============================================================

-- ============================================================
-- PART 1: ClinicSupplierManager'ga company field'lar qo'shish
-- ============================================================

-- Step 1.1: Column'lar qo'shish
ALTER TABLE "ClinicSupplierManager" 
  ADD COLUMN IF NOT EXISTS "company_name" TEXT,
  ADD COLUMN IF NOT EXISTS "business_number" TEXT,
  ADD COLUMN IF NOT EXISTS "company_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "company_email" TEXT,
  ADD COLUMN IF NOT EXISTS "company_address" TEXT,
  ADD COLUMN IF NOT EXISTS "linked_supplier_manager_id" TEXT;

-- Step 1.2: Mavjud ClinicSupplierManager'larni Supplier table'dan ma'lumotlar bilan to'ldirish
UPDATE "ClinicSupplierManager" csm
SET 
  company_name = COALESCE(s.company_name, '공급업체 없음'),
  business_number = s.business_number,
  company_phone = s.company_phone,
  company_email = s.company_email,
  company_address = s.company_address
FROM "Supplier" s
WHERE csm.supplier_id = s.id
  AND csm.company_name IS NULL;

-- Step 1.3: Agar Supplier topilmasa, default qo'yish
UPDATE "ClinicSupplierManager"
SET company_name = COALESCE(company_name, '공급업체 없음')
WHERE company_name IS NULL;

-- Step 1.4: linked_supplier_manager_id'ni to'ldirish
UPDATE "ClinicSupplierManager" csm
SET linked_supplier_manager_id = (
  SELECT sm.id
  FROM "Supplier" s
  JOIN "SupplierManager" sm ON sm.supplier_tenant_id = s.tenant_id
  WHERE s.id = csm.supplier_id
    AND sm.status = 'ACTIVE'
  LIMIT 1
)
WHERE csm.supplier_id IS NOT NULL
  AND csm.linked_supplier_manager_id IS NULL;

-- ============================================================
-- PART 2: ProductSupplier table yaratish
-- ============================================================

CREATE TABLE IF NOT EXISTS "ProductSupplier" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  clinic_supplier_manager_id TEXT NOT NULL,
  purchase_price INTEGER,
  moq INTEGER,
  lead_time_days INTEGER,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductSupplier_tenant_product_unique" 
ON "ProductSupplier"("tenant_id", "product_id");

CREATE INDEX IF NOT EXISTS "ProductSupplier_tenant_id_idx" 
ON "ProductSupplier"("tenant_id");

CREATE INDEX IF NOT EXISTS "ProductSupplier_product_id_idx" 
ON "ProductSupplier"("product_id");

CREATE INDEX IF NOT EXISTS "ProductSupplier_clinic_supplier_manager_id_idx" 
ON "ProductSupplier"("clinic_supplier_manager_id");

CREATE INDEX IF NOT EXISTS "ProductSupplier_tenant_clinic_supplier_idx" 
ON "ProductSupplier"("tenant_id", "clinic_supplier_manager_id");

CREATE UNIQUE INDEX IF NOT EXISTS "ProductSupplier_product_id_unique" 
ON "ProductSupplier"("product_id");

-- ============================================================
-- PART 3: Mavjud data'ni ProductSupplier'ga migrate qilish
-- ============================================================

-- Step 3.1: Product.supplier_manager_id orqali migrate qilish
INSERT INTO "ProductSupplier" (
  tenant_id,
  product_id,
  clinic_supplier_manager_id,
  purchase_price,
  created_at
)
SELECT DISTINCT ON (p.id)
  p.tenant_id,
  p.id as product_id,
  (
    SELECT csm.id 
    FROM "ClinicSupplierManager" csm
    WHERE csm.linked_supplier_manager_id = p.supplier_manager_id
      AND csm.tenant_id = p.tenant_id
    LIMIT 1
  ) as clinic_supplier_manager_id,
  p.purchase_price,
  p.created_at
FROM "Product" p
WHERE p.supplier_manager_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ProductSupplier" ps WHERE ps.product_id = p.id
  )
  AND EXISTS (
    SELECT 1
    FROM "ClinicSupplierManager" csm
    WHERE csm.linked_supplier_manager_id = p.supplier_manager_id
      AND csm.tenant_id = p.tenant_id
  );

-- Step 3.2: SupplierProduct table'dan migrate qilish
INSERT INTO "ProductSupplier" (
  tenant_id,
  product_id,
  clinic_supplier_manager_id,
  purchase_price,
  moq,
  lead_time_days,
  note,
  created_at
)
SELECT DISTINCT ON (sp.product_id)
  sp.tenant_id,
  sp.product_id,
  (
    SELECT csm.id 
    FROM "ClinicSupplierManager" csm
    WHERE csm.linked_supplier_manager_id = sp.supplier_manager_id
      AND csm.tenant_id = sp.tenant_id
    LIMIT 1
  ) as clinic_supplier_manager_id,
  sp.purchase_price,
  sp.moq,
  sp.lead_time_days,
  sp.note,
  sp.created_at
FROM "SupplierProduct" sp
WHERE sp.supplier_manager_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ProductSupplier" ps WHERE ps.product_id = sp.product_id
  )
  AND EXISTS (
    SELECT 1
    FROM "ClinicSupplierManager" csm
    WHERE csm.linked_supplier_manager_id = sp.supplier_manager_id
      AND csm.tenant_id = sp.tenant_id
  );

-- Step 3.3: Yangi ClinicSupplierManager yaratish
INSERT INTO "ClinicSupplierManager" (
  id,
  tenant_id,
  company_name,
  business_number,
  company_phone,
  company_email,
  company_address,
  name,
  phone_number,
  email1,
  created_at,
  updated_at
)
SELECT DISTINCT ON (sp.tenant_id, sp.contact_phone)
  gen_random_uuid()::text as id,
  sp.tenant_id,
  COALESCE(sp.company_name, '공급업체 없음') as company_name,
  NULL as business_number,
  NULL as company_phone,
  NULL as company_email,
  NULL as company_address,
  COALESCE(sp.contact_name, '담당자 없음') as name,
  sp.contact_phone as phone_number,
  sp.contact_email as email1,
  sp.created_at,
  sp.updated_at
FROM "SupplierProduct" sp
WHERE sp.contact_phone IS NOT NULL
  AND sp.supplier_manager_id IS NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM "ClinicSupplierManager" csm
    WHERE csm.tenant_id = sp.tenant_id
      AND csm.phone_number = sp.contact_phone
  )
ON CONFLICT DO NOTHING;

-- Step 3.4: Yangi yaratilgan ClinicSupplierManager'lar orqali ProductSupplier yaratish
INSERT INTO "ProductSupplier" (
  tenant_id,
  product_id,
  clinic_supplier_manager_id,
  purchase_price,
  moq,
  lead_time_days,
  note,
  created_at
)
SELECT DISTINCT ON (sp.product_id)
  sp.tenant_id,
  sp.product_id,
  csm.id as clinic_supplier_manager_id,
  sp.purchase_price,
  sp.moq,
  sp.lead_time_days,
  sp.note,
  sp.created_at
FROM "SupplierProduct" sp
JOIN "ClinicSupplierManager" csm ON 
  csm.tenant_id = sp.tenant_id
  AND csm.phone_number = sp.contact_phone
WHERE sp.supplier_manager_id IS NULL
  AND sp.contact_phone IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ProductSupplier" ps WHERE ps.product_id = sp.product_id
  );

-- Step 3.5: Default ClinicSupplierManager yaratish
INSERT INTO "ClinicSupplierManager" (
  id,
  tenant_id,
  company_name,
  name,
  phone_number,
  created_at,
  updated_at
)
SELECT DISTINCT ON (p.tenant_id)
  gen_random_uuid()::text as id,
  p.tenant_id,
  '공급업체 없음' as company_name,
  '담당자 없음' as name,
  '000-0000-0000' as phone_number,
  NOW() as created_at,
  NOW() as updated_at
FROM "Product" p
WHERE NOT EXISTS (
  SELECT 1 FROM "ProductSupplier" ps WHERE ps.product_id = p.id
)
AND NOT EXISTS (
  SELECT 1 
  FROM "ClinicSupplierManager" csm
  WHERE csm.tenant_id = p.tenant_id
    AND csm.phone_number = '000-0000-0000'
)
ON CONFLICT DO NOTHING;

-- Step 3.6: Default ClinicSupplierManager orqali qolgan Product'lar uchun ProductSupplier yaratish
INSERT INTO "ProductSupplier" (
  tenant_id,
  product_id,
  clinic_supplier_manager_id,
  purchase_price,
  created_at
)
SELECT 
  p.tenant_id,
  p.id as product_id,
  csm.id as clinic_supplier_manager_id,
  p.purchase_price,
  p.created_at
FROM "Product" p
CROSS JOIN "ClinicSupplierManager" csm
WHERE csm.tenant_id = p.tenant_id
  AND csm.phone_number = '000-0000-0000'
  AND NOT EXISTS (
    SELECT 1 FROM "ProductSupplier" ps WHERE ps.product_id = p.id
  );

-- ============================================================
-- PART 4: ClinicSupplierLink'ga clinic_supplier_manager_id qo'shish
-- ============================================================

ALTER TABLE "ClinicSupplierLink"
  ADD COLUMN IF NOT EXISTS "clinic_supplier_manager_id" TEXT;

CREATE INDEX IF NOT EXISTS "ClinicSupplierLink_clinic_supplier_manager_id_idx" 
ON "ClinicSupplierLink"("clinic_supplier_manager_id");

UPDATE "ClinicSupplierLink" csl
SET clinic_supplier_manager_id = (
  SELECT csm.id
  FROM "ClinicSupplierManager" csm
  WHERE csm.linked_supplier_manager_id = csl.supplier_manager_id
    AND csm.tenant_id = csl.tenant_id
  LIMIT 1
)
WHERE csl.clinic_supplier_manager_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM "ClinicSupplierManager" csm
    WHERE csm.linked_supplier_manager_id = csl.supplier_manager_id
      AND csm.tenant_id = csl.tenant_id
  );

-- ============================================================
-- PART 5: Validation va logging
-- ============================================================

DO $$
DECLARE
  total_products INTEGER;
  products_with_supplier INTEGER;
  clinic_managers_count INTEGER;
  product_suppliers_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_products FROM "Product";
  SELECT COUNT(*) INTO products_with_supplier 
  FROM "ProductSupplier";
  SELECT COUNT(*) INTO clinic_managers_count 
  FROM "ClinicSupplierManager";
  SELECT COUNT(*) INTO product_suppliers_count 
  FROM "ProductSupplier";
  
  RAISE NOTICE '=== Migration Step 1 Complete ===';
  RAISE NOTICE 'Total products: %', total_products;
  RAISE NOTICE 'Products with ProductSupplier: %', products_with_supplier;
  RAISE NOTICE 'ClinicSupplierManager count: %', clinic_managers_count;
  RAISE NOTICE 'ProductSupplier count: %', product_suppliers_count;
  
  IF products_with_supplier < total_products THEN
    RAISE WARNING 'Some products do not have ProductSupplier mapping!';
  END IF;
END $$;