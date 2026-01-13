# 🔧 Tenant ID Fix - Complete Guide

## 🚨 Problem

When a clinic manually creates a supplier **before** the supplier registers on the platform, the `Supplier.tenant_id` is incorrectly set to the **clinic's tenant_id** instead of generating a unique **supplier tenant_id**.

**Example:**

```
❌ WRONG: tenant_id = "clinic_1767755085259_7olvdb2q"
✅ RIGHT: tenant_id = "supplier_1234567890_1705392000"
```

This causes issues when:

1. Orders are sent to supplier-backend
2. Supplier tries to view orders on their platform
3. Return service tries to find supplier information

## ✅ Solution

### Part 1: Code Fix (Already Applied!)

**File**: `apps/supplier-backend/src/modules/manager/manager.service.ts`

**Change**: When supplier registers and claims an existing supplier record, automatically fix the `tenant_id` if it starts with `'clinic_'`.

```typescript
// Before (WRONG):
tenant_id: existingSupplier.tenant_id; // Preserves clinic_xxx

// After (FIXED):
tenant_id: existingSupplier.tenant_id?.startsWith("clinic_")
  ? `supplier_${businessNumber}_${Date.now()}`
  : existingSupplier.tenant_id;
```

### Part 2: Database Fix (Run Manually)

**File**: `FIX_TENANT_ID_SIMPLE.sql`

Run each SQL step one by one to fix existing wrong data.

---

## 📋 How to Fix Existing Data

### Option 1: Using SQL File (Recommended)

1. **Connect to database**:

   ```bash
   psql -h your-db-host -U your-user -d your-database
   ```

2. **Run the fix**:

   ```bash
   \i apps/supplier-backend/FIX_TENANT_ID_SIMPLE.sql
   ```

3. **Review each step's output** before continuing

### Option 2: Manual Steps

#### Step 1: Check wrong data

```sql
SELECT
  id,
  company_name,
  business_number,
  tenant_id
FROM "Supplier"
WHERE tenant_id LIKE 'clinic_%';
```

**Expected**: Shows suppliers with wrong tenant_id

#### Step 2: Fix Supplier.tenant_id

```sql
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
```

**Expected**: Returns number of rows updated

#### Step 3: Fix SupplierManager.supplier_tenant_id

```sql
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
```

**Expected**: Returns number of rows updated

#### Step 4: Verify

```sql
SELECT COUNT(*) as wrong_count
FROM "Supplier"
WHERE tenant_id LIKE 'clinic_%';
```

**Expected**: `0` (all fixed!)

---

## 🧪 Testing

### Test 1: New Supplier Registration

1. **Clinic creates manual supplier**:

   - Company: "Test Company"
   - Phone: "01012345678"

2. **Check database**:

   ```sql
   SELECT tenant_id FROM "Supplier"
   WHERE company_name = 'Test Company';
   ```

   **Expected**: `clinic_xxx...` ❌ (This is old behavior, expected)

3. **Supplier registers on platform**:

   - Same company name
   - Same business number

4. **Check database again**:
   ```sql
   SELECT tenant_id FROM "Supplier"
   WHERE company_name = 'Test Company';
   ```
   **Expected**: `supplier_xxx...` ✅ (AUTO-FIXED!)

### Test 2: Order Flow

1. **Clinic creates order** to fixed supplier

2. **Check supplier-backend**:

   - Go to supplier frontend
   - Login as supplier
   - Orders page should show the order ✅

3. **Check return service**:
   - No more errors about tenant_id mismatch ✅

---

## 📊 Impact

### Before Fix:

- ❌ Supplier can't see orders on their platform
- ❌ Return service throws errors
- ❌ Order notification fails
- ❌ Supplier-backend API fails

### After Fix:

- ✅ Supplier sees all orders
- ✅ Return service works correctly
- ✅ Order notifications work
- ✅ Supplier-backend API works

---

## 🔍 Debugging

### Check if supplier has wrong tenant_id:

```sql
SELECT
  s.id,
  s.company_name,
  s.tenant_id,
  sm.supplier_tenant_id,
  CASE
    WHEN s.tenant_id LIKE 'clinic_%' THEN '❌ WRONG'
    WHEN s.tenant_id LIKE 'supplier_%' THEN '✅ CORRECT'
    ELSE '⚠️ UNKNOWN'
  END as status
FROM "Supplier" s
LEFT JOIN "SupplierManager" sm ON sm.supplier_id = s.id
WHERE s.company_name LIKE '%바인뷰티%';
```

### Check if SupplierManager matches Supplier:

```sql
SELECT
  s.company_name,
  s.tenant_id as supplier_tenant_id,
  sm.supplier_tenant_id as manager_supplier_tenant_id,
  CASE
    WHEN s.tenant_id = sm.supplier_tenant_id THEN '✅ MATCH'
    ELSE '❌ MISMATCH'
  END as validation
FROM "Supplier" s
INNER JOIN "SupplierManager" sm ON sm.supplier_id = s.id;
```

---

## ✅ Checklist

- [x] Code fix applied (`manager.service.ts`)
- [ ] Database fix run (`FIX_TENANT_ID_SIMPLE.sql`)
- [ ] Verification complete (0 wrong tenant_ids)
- [ ] Test: New supplier registration
- [ ] Test: Order flow works
- [ ] Test: Return service no errors

---

## 📞 Support

If you still see errors after applying the fix:

1. Check database manually (SQL queries above)
2. Verify code changes are deployed
3. Restart supplier-backend
4. Clear cache if any

---

**ALL DONE!** 🎉
