-- ========================================
-- SIMPLE FIX: Supplier tenant_id
-- Run each step one by one and check results
-- ========================================

-- ✅ STEP 1: CHECK - Find all wrong tenant_ids
-- Expected: Should show suppliers with tenant_id starting with 'clinic_'
SELECT 
  id,
  company_name,
  business_number,
  tenant_id,
  created_at
FROM "Supplier"
WHERE tenant_id LIKE 'clinic_%'
ORDER BY created_at DESC;

-- ⏸️ PAUSE: Review results above. If empty, no fix needed!
-- If you see rows, continue to STEP 2.

-- ========================================

-- ✅ STEP 2: FIX - Update Supplier.tenant_id
-- This will generate new tenant_id like: supplier_1234567890_1705392000
UPDATE "Supplier"
SET 
  tenant_id = CONCAT(
    'supplier_',
    REPLACE(business_number, '-', ''),
    '_',
    EXTRACT(EPOCH FROM NOW())::bigint
  ),
  updated_at = NOW()
WHERE tenant_id LIKE 'clinic_%';

-- Check how many rows updated
-- Expected: Same number as STEP 1

-- ========================================

-- ✅ STEP 3: UPDATE - Fix SupplierManager.supplier_tenant_id
-- This ensures SupplierManager points to correct Supplier
UPDATE "SupplierManager"
SET 
  supplier_tenant_id = (
    SELECT s.tenant_id
    FROM "Supplier" s
    WHERE s.id = "SupplierManager".supplier_id
    LIMIT 1
  ),
  updated_at = NOW()
WHERE supplier_tenant_id LIKE 'clinic_%';

-- Check how many rows updated

-- ========================================

-- ✅ STEP 4: VERIFY - Check all fixed
-- Expected: 0 rows (all fixed!)
SELECT 
  COUNT(*) as wrong_tenant_id_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ ALL FIXED!'
    ELSE '❌ STILL HAVE ISSUES'
  END as status
FROM "Supplier"
WHERE tenant_id LIKE 'clinic_%';

-- ========================================

-- ✅ STEP 5: FINAL CHECK - Verify relationships
-- Expected: All rows should show '✅ MATCH'
SELECT 
  s.company_name,
  s.tenant_id as supplier_tenant_id,
  sm.name as manager_name,
  sm.supplier_tenant_id as manager_supplier_tenant_id,
  CASE 
    WHEN s.tenant_id = sm.supplier_tenant_id THEN '✅ MATCH'
    ELSE '❌ MISMATCH'
  END as validation
FROM "Supplier" s
INNER JOIN "SupplierManager" sm ON sm.supplier_id = s.id
WHERE s.company_name LIKE '%바인뷰티%'
   OR s.company_name LIKE '%Test%'
ORDER BY s.created_at DESC
LIMIT 10;

