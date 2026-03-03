# Edit Page Update - Final Fix

## 🐛 Issues Found

### Issue 1: Fields updating in DB but NOT showing on detail page
**Affected fields:**
- 보관 위치 (Storage Location)
- 구매가 (Purchase Price)  
- 유효기간 (Expiry Date)

**Root Cause:**
Backend was returning `expiryDate` and `storageLocation` from **Batch** instead of **Product**. When user edits product-level fields, batches weren't updated, so old values were displayed.

### Issue 2: 제품 재고 수량 NOT updating at all
**Root Cause:**
Two issues:
1. Backend: `dto.currentStock ?? existing.current_stock` fails when `currentStock` is `0` (falsy)
2. Frontend: `finalProductResponse.currentStock || product.currentStock` fails when new value is `0`

---

## ✅ Fixes Applied

### 1. Backend Service (`products.service.ts`)

#### Fix: Return product-level fields first in `getProduct`
```typescript
// BEFORE (wrong order)
expiryDate: latestBatch?.expiry_date ?? null,
storageLocation: latestBatch?.storage ?? product.storage ?? null,

// AFTER (correct priority)
expiryDate: product.expiry_date ?? latestBatch?.expiry_date ?? null,
storageLocation: product.storage ?? latestBatch?.storage ?? null,
```

#### Fix: Allow 0 values in `updateProduct`
```typescript
// BEFORE (fails for 0)
current_stock: dto.currentStock ?? existing.current_stock,
min_stock: dto.minStock ?? existing.min_stock,

// AFTER (works for 0)
current_stock: dto.currentStock !== undefined ? dto.currentStock : existing.current_stock,
min_stock: dto.minStock !== undefined ? dto.minStock : existing.min_stock,
```

### 2. Frontend (`products/[id]/page.tsx`)

#### Fix: Handle 0 values correctly
```typescript
// BEFORE (fails for 0)
currentStock: finalProductResponse.currentStock || product.currentStock,

// AFTER (works for 0)
currentStock:
  finalProductResponse.currentStock !== undefined
    ? finalProductResponse.currentStock
    : finalProductResponse.current_stock !== undefined
    ? finalProductResponse.current_stock
    : product.currentStock,
```

#### Fix: Clear cache before update
```typescript
const { clearCache } = await import("../../../lib/api");
clearCache(`/products/${product.id}`);
clearCache(`/products`);
```

---

## 🧪 Testing Steps

### Test 1: 제품 재고 수량 (Product Stock)
1. Open product edit page
2. Change stock from 100 to **0** (critical test case!)
3. Save
4. Verify:
   - ✅ Database shows 0
   - ✅ Detail page shows 0
   - ✅ No fallback to old value

### Test 2: 보관 위치 (Storage Location)
1. Edit product storage to "냉동고"
2. Save
3. Verify:
   - ✅ Database updated
   - ✅ Detail page shows "냉동고" immediately
   - ✅ Not showing batch-level storage

### Test 3: 구매가 (Purchase Price)
1. Edit purchase price to 50000
2. Save
3. Verify:
   - ✅ Database updated
   - ✅ Detail page shows 50000
   - ✅ Correct value after refresh

### Test 4: 유효기간 (Expiry Date)
1. Set expiry date to 2025-12-31
2. Save
3. Verify:
   - ✅ Database updated
   - ✅ Detail page shows 2025-12-31
   - ✅ Product-level expiry, not batch-level

---

## 📊 Debug Console Output

When editing and saving, you should see:

**Frontend console:**
```
📦 Payload being sent to backend: {
  "name": "Test Product",
  "currentStock": 0,
  "storage": "냉동고",
  "purchasePrice": 50000,
  "expiryDate": "2025-12-31",
  "alertDays": "7",
  ...
}
```

**Backend logs:**
```
📥 Received DTO for product update: {
  "name": "Test Product",
  "currentStock": 0,
  "storage": "냉동고",
  "purchasePrice": 50000,
  "expiryDate": "2025-12-31",
  "alertDays": "7",
  ...
}
```

---

## 🚀 Deployment Checklist

- [ ] Test locally with `pnpm run start:dev`
- [ ] Verify all 4 test cases pass
- [ ] Check console logs for 📦 and 📥 messages
- [ ] Rebuild backend Docker image
- [ ] Push to Docker Hub
- [ ] Deploy to VPS
- [ ] Run migration on VPS (for `expiry_date` column)
- [ ] Test on VPS

---

## 📝 Key Learnings

### JavaScript Falsy Values Pitfall
```javascript
// ❌ WRONG: 0 is falsy!
value: dto.value ?? existing.value  // 0 becomes existing.value
value: response.value || fallback    // 0 becomes fallback

// ✅ CORRECT: Explicit undefined check
value: dto.value !== undefined ? dto.value : existing.value
value: response.value !== undefined ? response.value : fallback
```

### Prisma Update Behavior
```javascript
// ❌ WRONG: Prisma ignores undefined
data: { field: value !== undefined ? value : undefined }

// ✅ CORRECT: Use spread operator for conditional updates
data: {
  ...otherFields,
  ...(value !== undefined && { field: value })
}
```

### Data Priority in Getter Methods
Always return product-level data first, then fallback to batch/relation data:
```typescript
// ✅ CORRECT
expiryDate: product.expiry_date ?? batch?.expiry_date ?? null

// ❌ WRONG
expiryDate: batch?.expiry_date ?? product.expiry_date ?? null
```

---

**Status:** ✅ All fixes applied and ready for testing
**Date:** 2026-01-08
**Critical:** Must test with `0` values!

