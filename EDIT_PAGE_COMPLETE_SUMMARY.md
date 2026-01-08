# Edit Page - Complete Implementation Summary

## 🎯 Purpose
Edit page is for **data correction** when product was created with wrong information. When user edits product, changes should propagate to:
1. ✅ Product table
2. ✅ First Batch (oldest, created with product)
3. ✅ ProductSupplier (for purchase price only)

**Other batches remain unchanged** - they are separate inbound operations with their own historical data.

---

## 📊 Complete Field Update Matrix

| Field Name (Korean) | Field Name (English) | Product Table | First Batch | ProductSupplier | Other Batches |
|---------------------|---------------------|---------------|-------------|-----------------|---------------|
| 제품 재고 수량 | currentStock | ✅ `current_stock` + `inbound_qty` | ✅ `inbound_qty` | ❌ | ❌ |
| 구매가 | purchasePrice | ✅ `purchase_price` | ✅ `purchase_price` | ✅ `purchase_price` | ❌ |
| 보관 위치 | storage | ✅ `storage` | ✅ `storage` | ❌ | ❌ |
| 입고 담당자 | inboundManager | ✅ `inbound_manager` | ✅ `inbound_manager` | ❌ | ❌ |
| 단위 | unit | ✅ `unit` | ✅ `unit` | ❌ | ❌ |
| 유효기간 | expiryDate | ✅ `expiry_date` | ✅ `expiry_date` | ❌ | ❌ |

**Total: 6 fields** update Product + First Batch simultaneously

---

## 🔧 Implementation Code

### Backend: `products.service.ts` - `updateProduct` method

```typescript
// 1. Find FIRST batch (oldest, created with product)
const firstBatch = await tx.batch.findFirst({
  where: { product_id: id, tenant_id: tenantId },
  orderBy: { created_at: "asc" }, // ASC = oldest first
});

if (firstBatch) {
  const batchUpdateData: any = {};

  // 2. Collect all field updates
  if (dto.currentStock !== undefined) {
    batchUpdateData.inbound_qty = dto.currentStock;
  }

  if (dto.purchasePrice !== undefined) {
    batchUpdateData.purchase_price = dto.purchasePrice;
  }

  if (dto.storage !== undefined) {
    batchUpdateData.storage = dto.storage;
  }

  if (dto.inboundManager !== undefined) {
    batchUpdateData.inbound_manager = dto.inboundManager;
  }

  if (dto.unit !== undefined) {
    batchUpdateData.unit = dto.unit;
  }

  if (dto.expiryDate !== undefined) {
    batchUpdateData.expiry_date = dto.expiryDate ? new Date(dto.expiryDate) : null;
  }

  // 3. Apply updates if there are changes
  if (Object.keys(batchUpdateData).length > 0) {
    await tx.batch.update({
      where: { id: firstBatch.id },
      data: batchUpdateData,
    });
  }
}

// 4. Update ProductSupplier purchase_price
if (dto.purchasePrice !== undefined) {
  const existingProductSupplier = await tx.productSupplier.findFirst({
    where: { product_id: id, tenant_id: tenantId },
  });

  if (existingProductSupplier) {
    await tx.productSupplier.update({
      where: { id: existingProductSupplier.id },
      data: { purchase_price: dto.purchasePrice },
    });
  }
}
```

---

## 🧪 Complete Testing Guide

### Test Setup: Create Product
```
1. Create product with:
   - 제품 재고 수량: 100
   - 구매가: 10000
   - 보관 위치: "냉장고"
   - 입고 담당자: "이영희"
   - 단위: "EA"
   - 유효기간: 2025-12-31

2. Verify initial state:
```

**SQL Check:**
```sql
-- Product table
SELECT current_stock, inbound_qty, purchase_price, storage, 
       inbound_manager, unit, expiry_date 
FROM "Product" 
WHERE name = 'Test Product';
-- Expected: 100, 100, 10000, "냉장고", "이영희", "EA", 2025-12-31

-- First batch
SELECT inbound_qty, purchase_price, storage, inbound_manager, 
       unit, expiry_date, created_at 
FROM "Batch" 
WHERE product_id = '<id>' 
ORDER BY created_at ASC 
LIMIT 1;
-- Expected: 100, 10000, "냉장고", "이영희", "EA", 2025-12-31

-- ProductSupplier
SELECT purchase_price 
FROM "ProductSupplier" 
WHERE product_id = '<id>';
-- Expected: 10000
```

---

### Test 1: Edit All Fields
```
1. Go to product edit page
2. Change all fields:
   - 제품 재고 수량: 100 → 150
   - 구매가: 10000 → 15000
   - 보관 위치: "냉장고" → "냉동고"
   - 입고 담당자: "이영희" → "김철수"
   - 단위: "EA" → "BOX"
   - 유효기간: 2025-12-31 → 2026-06-30
3. Save
```

**Expected Console Output:**
```
📥 Received DTO for product update: {
  "currentStock": 150,
  "purchasePrice": 15000,
  "storage": "냉동고",
  "inboundManager": "김철수",
  "unit": "BOX",
  "expiryDate": "2026-06-30",
  ...
}

🔍 dto.currentStock: 150
🔍 Updating current_stock from 100 to 150
🔍 Updating inbound_qty from 100 to 150
🔍 Updating first batch inbound_qty from 100 to 150
🔍 Updating first batch purchase_price from 10000 to 15000
🔍 Updating first batch storage from "냉장고" to "냉동고"
🔍 Updating first batch inbound_manager from "이영희" to "김철수"
🔍 Updating first batch unit from "EA" to "BOX"
🔍 Updating first batch expiry_date from 2025-12-31 to 2026-06-30
🔍 Updated ProductSupplier purchase_price from 10000 to 15000
```

**Expected Database State:**
```sql
-- Product table
SELECT current_stock, inbound_qty, purchase_price, storage, 
       inbound_manager, unit, expiry_date 
FROM "Product" 
WHERE name = 'Test Product';
-- Expected: 150, 150, 15000, "냉동고", "김철수", "BOX", 2026-06-30 ✅

-- First batch
SELECT inbound_qty, purchase_price, storage, inbound_manager, 
       unit, expiry_date 
FROM "Batch" 
WHERE product_id = '<id>' 
ORDER BY created_at ASC 
LIMIT 1;
-- Expected: 150, 15000, "냉동고", "김철수", "BOX", 2026-06-30 ✅

-- ProductSupplier
SELECT purchase_price 
FROM "ProductSupplier" 
WHERE product_id = '<id>';
-- Expected: 15000 ✅
```

---

### Test 2: Add New Batch (Inbound Page)
```
1. Go to inbound page
2. Add new batch with DIFFERENT values:
   - 제품 재고 수량: 200
   - 구매가: 12000
   - 보관 위치: "창고"
   - 입고 담당자: "박민수"
   - 유효기간: 2026-12-31
```

**Expected Database State:**
```sql
SELECT inbound_qty, purchase_price, storage, inbound_manager, 
       unit, expiry_date, created_at 
FROM "Batch" 
WHERE product_id = '<id>' 
ORDER BY created_at ASC;

-- Expected 2 rows:
-- Row 1 (First batch - UPDATED in previous test):
-- 150, 15000, "냉동고", "김철수", "BOX", 2026-06-30, 2026-01-08 10:00 ✅

-- Row 2 (New batch - INDEPENDENT values):
-- 200, 12000, "창고", "박민수", "BOX", 2026-12-31, 2026-01-08 15:00 ✅
```

---

### Test 3: Edit Again (Verify First Batch Only)
```
1. Go to product edit page again
2. Change 구매가: 15000 → 20000
3. Save
```

**Expected Database State:**
```sql
SELECT inbound_qty, purchase_price, created_at 
FROM "Batch" 
WHERE product_id = '<id>' 
ORDER BY created_at ASC;

-- Expected:
-- Row 1 (First batch): 150, 20000 ✅ UPDATED!
-- Row 2 (Second batch): 200, 12000 ✅ UNCHANGED!
```

---

## 🎯 Key Design Principles

### 1. First Batch = Product Default
- First batch is created **with** the product
- Represents the **original/default** values
- Should stay in sync with product-level corrections

### 2. Later Batches = Independent Operations
- Each inbound is a **separate transaction**
- May have **different prices/storage/dates**
- Historical accuracy preserved

### 3. Edit Page = Data Correction
- Not a normal operation, but a **mistake fix**
- Should update **original records** (Product + First Batch)
- Should **NOT** affect historical data (Other Batches)

### 4. ProductSupplier Special Case
- Only `purchase_price` updates
- Represents **corrected contract price**
- Other fields (MOQ, lead time) are contract terms, don't auto-update

---

## 📋 Update Flow Diagram

```
Edit Page Changes
│
├─→ Product Table
│   ├── current_stock ✅
│   ├── inbound_qty ✅
│   ├── purchase_price ✅
│   ├── storage ✅
│   ├── inbound_manager ✅
│   ├── unit ✅
│   └── expiry_date ✅
│
├─→ First Batch (created_at ASC)
│   ├── inbound_qty ✅
│   ├── purchase_price ✅
│   ├── storage ✅
│   ├── inbound_manager ✅
│   ├── unit ✅
│   └── expiry_date ✅
│
├─→ ProductSupplier
│   └── purchase_price ✅
│
└─→ Other Batches
    └── No changes (historical data preserved) ✅
```

---

## 🐛 Debugging Tips

### Check First Batch Identification
```sql
-- Make sure you're finding the FIRST batch (oldest)
SELECT id, batch_no, created_at, inbound_qty, purchase_price
FROM "Batch"
WHERE product_id = '<id>'
ORDER BY created_at ASC;
-- First row should be the one getting updated
```

### Check Update Logs
```bash
# Backend logs should show:
🔍 Updating first batch inbound_qty from X to Y
🔍 Updating first batch purchase_price from X to Y
🔍 Updating first batch storage from X to Y
# ... etc
```

### Verify ProductSupplier Exists
```sql
SELECT ps.id, ps.purchase_price, p.name
FROM "ProductSupplier" ps
JOIN "Product" p ON ps.product_id = p.id
WHERE p.id = '<id>';
-- Should return 1 row if supplier is linked
```

---

## ✅ Implementation Checklist

### Backend
- [x] Find first batch using `created_at ASC`
- [x] Update `inbound_qty` when `currentStock` changes
- [x] Update `purchase_price` when `purchasePrice` changes
- [x] Update `storage` when `storage` changes
- [x] Update `inbound_manager` when `inboundManager` changes
- [x] Update `unit` when `unit` changes
- [x] Update `expiry_date` when `expiryDate` changes
- [x] Update `ProductSupplier.purchase_price` when `purchasePrice` changes
- [x] Add comprehensive logging for debugging
- [x] Handle null/undefined values correctly

### Frontend
- [x] Send all edited fields in payload
- [x] Clear cache after update
- [x] Display updated values immediately
- [x] Handle 0 values correctly (not treated as falsy)

### Testing
- [ ] Create product with all fields
- [ ] Edit all fields and verify updates
- [ ] Add new batch with different values
- [ ] Verify first batch updated, second unchanged
- [ ] Check console logs for debugging info
- [ ] Verify database state matches expectations

---

## 🚀 Deployment Steps

1. **Local Testing**
   ```bash
   cd apps/backend && pnpm run start:dev
   cd apps/frontend && pnpm run dev
   ```

2. **Test All Scenarios**
   - Create product
   - Edit all 6 fields
   - Add new batch
   - Edit again, verify first batch only

3. **Deploy to VPS**
   ```bash
   # Rebuild backend
   docker build -t findbeauty/clinic-backend:latest \
     --platform linux/amd64 \
     -f apps/backend/Dockerfile .
   
   docker push findbeauty/clinic-backend:latest
   
   # VPS: Pull and restart
   ssh -i ~/.ssh/seoul-clinic.pem ubuntu@<VPS_IP>
   cd ~/clinic-erp
   docker-compose -f docker-compose.prod.yml pull backend
   docker-compose -f docker-compose.prod.yml up -d backend
   ```

---

**Status:** ✅ Complete implementation ready for testing
**Date:** 2026-01-08
**Fields Updated:** 6 (currentStock, purchasePrice, storage, inboundManager, unit, expiryDate)
**Tables Updated:** 3 (Product, Batch, ProductSupplier)

