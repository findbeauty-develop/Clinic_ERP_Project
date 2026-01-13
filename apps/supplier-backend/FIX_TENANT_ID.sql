-- ========================================
-- FIX: Supplier tenant_id (clinic_ → supplier_)
-- ========================================
-- 
-- PROBLEM: When clinic manually creates a supplier, the tenant_id 
-- is incorrectly set to clinic's tenant_id instead of supplier's tenant_id
--
-- This script fixes:
-- 1. Supplier.tenant_id (clinic_xxx → supplier_xxx)
-- 2. SupplierManager.supplier_tenant_id (must match Supplier.tenant_id)
-- ========================================

-- STEP 1: Check current wrong data
SELECT 
  'BEFORE FIX' as status,
  s.id,
  s.company_name,
  s.business_number,
  s.tenant_id,
  sm.id as manager_id,
  sm.name as manager_name,
  sm.supplier_tenant_id as manager_supplier_tenant_id
FROM "Supplier" s
LEFT JOIN "SupplierManager" sm ON sm.supplier_tenant_id = s.tenant_id
WHERE s.tenant_id LIKE 'clinic_%'
ORDER BY s.created_at DESC;

-- STEP 2: Fix Supplier.tenant_id
-- Generate new tenant_id: supplier_{business_number}_{timestamp}
UPDATE "Supplier"
SET 
  tenant_id = CONCAT(
    'supplier_',
    REPLACE(business_number, '-', ''),
    '_',
    EXTRACT(EPOCH FROM NOW())::bigint
  ),
  updated_at = NOW()
WHERE tenant_id LIKE 'clinic_%'
RETURNING 
  id,
  company_name,
  business_number,
  tenant_id as new_tenant_id;

-- STEP 3: Update SupplierManager.supplier_tenant_id to match new Supplier.tenant_id
-- This ensures SupplierManager points to correct supplier
UPDATE "SupplierManager" sm
SET 
  supplier_tenant_id = s.tenant_id,
  updated_at = NOW()
FROM "Supplier" s
WHERE sm.supplier_tenant_id LIKE 'clinic_%'
  AND s.business_number IN (
    SELECT s2.business_number
    FROM "Supplier" s2
    WHERE s2.id = (
      SELECT supplier_id 
      FROM "SupplierManager" sm2 
      WHERE sm2.id = sm.id
      LIMIT 1
    )
  )
RETURNING 
  sm.id,
  sm.name,
  sm.supplier_tenant_id as new_supplier_tenant_id;

-- STEP 4: Verify fix
SELECT 
  'AFTER FIX' as status,
  s.id,
  s.company_name,
  s.business_number,
  s.tenant_id,
  sm.id as manager_id,
  sm.name as manager_name,
  sm.supplier_tenant_id as manager_supplier_tenant_id,
  CASE 
    WHEN s.tenant_id = sm.supplier_tenant_id THEN '✅ MATCH'
    ELSE '❌ MISMATCH'
  END as validation
FROM "Supplier" s
LEFT JOIN "SupplierManager" sm ON sm.supplier_tenant_id = s.tenant_id
WHERE s.business_number IN (
  SELECT business_number FROM "Supplier" WHERE updated_at > NOW() - INTERVAL '5 minutes'
)
ORDER BY s.updated_at DESC;

-- STEP 5: Final check - should return 0 rows
SELECT 
  'VERIFICATION: Should be 0 rows' as status,
  COUNT(*) as wrong_tenant_id_count
FROM "Supplier"
WHERE tenant_id LIKE 'clinic_%';

