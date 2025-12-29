-- Fix supplier tenant_id that incorrectly uses clinic tenant_id
-- This script corrects the tenant_id for suppliers and their managers

-- Step 1: Check current state
SELECT 
  'Current State' as step,
  s.id as supplier_id,
  s.company_name,
  s.business_number,
  s.tenant_id as current_tenant_id,
  sm.id as manager_id,
  sm.name as manager_name,
  sm.supplier_tenant_id as manager_supplier_tenant_id
FROM "Supplier" s
LEFT JOIN "SupplierManager" sm ON s.tenant_id = sm.supplier_tenant_id
WHERE s.id = '8387a4ca-ea59-4e02-a6dd-2ffd5faa1b5c';

-- Step 2: Generate correct tenant_id
-- For supplier with business number 771-86-02758
-- Correct tenant_id should be: supplier_7718602758_<timestamp>

-- Step 3: Update Supplier table
UPDATE "Supplier"
SET tenant_id = 'supplier_7718602758_' || extract(epoch from now())::bigint
WHERE id = '8387a4ca-ea59-4e02-a6dd-2ffd5faa1b5c'
  AND tenant_id LIKE 'clinic_%'
RETURNING id, company_name, tenant_id;

-- Step 4: Update SupplierManager table to match
UPDATE "SupplierManager" sm
SET supplier_tenant_id = s.tenant_id
FROM "Supplier" s
WHERE s.id = '8387a4ca-ea59-4e02-a6dd-2ffd5faa1b5c'
  AND sm.id IN (
    SELECT id FROM "SupplierManager" 
    WHERE supplier_tenant_id LIKE 'clinic_%'
  )
RETURNING sm.id, sm.name, sm.supplier_tenant_id;

-- Step 5: Verify fix
SELECT 
  'After Fix' as step,
  s.id as supplier_id,
  s.company_name,
  s.tenant_id as new_tenant_id,
  sm.id as manager_id,
  sm.name as manager_name,
  sm.supplier_tenant_id as new_manager_supplier_tenant_id
FROM "Supplier" s
LEFT JOIN "SupplierManager" sm ON s.tenant_id = sm.supplier_tenant_id
WHERE s.id = '8387a4ca-ea59-4e02-a6dd-2ffd5faa1b5c';

