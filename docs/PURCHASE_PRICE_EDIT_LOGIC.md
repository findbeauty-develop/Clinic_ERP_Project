# Purchase Price Edit Logic - Complete Implementation

## 🎯 Requirement

When editing **구매가 (Purchase Price)** on product edit page, update it in **3 places**:
1. ✅ `Product.purchase_price`
2. ✅ `First Batch.purchase_price` (birinchi batch, product bilan yaratilgan)
3. ✅ `ProductSupplier.purchase_price`

**Why?** Edit page is for **data correction**. User created product with wrong price and needs to fix it.

---

## 📊 Data Structure Understanding

### When Product is Created:
```
1. Product created
   └── Product.purchase_price = 10000

2. First batch created (initial batch)
   └── Batch[0].purchase_price = 10000
   └── Batch[0].created_at = "2026-01-01"

3. Supplier linked
   └── ProductSupplier.purchase_price = 10000
```

### When New Batches Added (Inbound):
```
New inbound operation adds new batch
   └── Batch[1].purchase_price = 12000  ← Different price OK!
   └── Batch[1].created_at = "2026-01-05"

Product.purchase_price = 10000 (unchanged)
Batch[0].purchase_price = 10000 (unchanged, historical)
```

### When Editing on Edit Page (Data Correction):
```
User changes 구매가: 10000 → 15000
   ↓
Product.purchase_price = 15000 ✅
Batch[0].purchase_price = 15000 ✅ (OLDEST batch only)
Batch[1].purchase_price = 12000 (unchanged, historical)
ProductSupplier.purchase_price = 15000 ✅
```

---

## 🔧 Implementation

### Backend Changes (`products.service.ts`)

#### 1. Update Product table (already exists)
```typescript
await tx.product.update({
  where: { id },
  data: {
    purchase_price: dto.purchasePrice ?? existing.purchase_price,
    // ... other fields
  }
});
```

#### 2. Update FIRST Batch (oldest batch created with product)
```typescript
// ✅ Find the FIRST batch (oldest, created with product)
const firstBatch = await tx.batch.findFirst({
  where: { product_id: id, tenant_id: tenantId },
  orderBy: { created_at: "asc" }, // ASC = oldest first
});

if (firstBatch) {
  const batchUpdateData: any = {};

  // Update inbound_qty if stock changed
  if (dto.currentStock !== undefined) {
    batchUpdateData.inbound_qty = dto.currentStock;
    console.log("🔍 Updating first batch inbound_qty from", 
      firstBatch.inbound_qty, "to", dto.currentStock);
  }

  // Update purchase_price if price changed
  if (dto.purchasePrice !== undefined) {
    batchUpdateData.purchase_price = dto.purchasePrice;
    console.log("🔍 Updating first batch purchase_price from", 
      firstBatch.purchase_price, "to", dto.purchasePrice);
  }

  // Only update if there are changes
  if (Object.keys(batchUpdateData).length > 0) {
    await tx.batch.update({
      where: { id: firstBatch.id },
      data: batchUpdateData,
    });
  }
}
```

#### 3. Update ProductSupplier
```typescript
// ✅ Update ProductSupplier purchase_price if changed
if (dto.purchasePrice !== undefined) {
  const existingProductSupplier = await tx.productSupplier.findFirst({
    where: { product_id: id, tenant_id: tenantId },
  });

  if (existingProductSupplier) {
    await tx.productSupplier.update({
      where: { id: existingProductSupplier.id },
      data: { purchase_price: dto.purchasePrice },
    });
    console.log("🔍 Updated ProductSupplier purchase_price from", 
      existingProductSupplier.purchase_price, "to", dto.purchasePrice);
  }
}
```

---

## 🧪 Testing Scenarios

### Test 1: Create Product and Verify Initial State
```sql
-- Product yarating: name="Test Product", purchase_price=10000

-- Check all 3 tables
SELECT purchase_price FROM "Product" WHERE name='Test Product';
-- Expected: 10000

SELECT purchase_price, created_at FROM "Batch" 
WHERE product_id='<product_id>' 
ORDER BY created_at ASC;
-- Expected: First batch = 10000

SELECT purchase_price FROM "ProductSupplier" 
WHERE product_id='<product_id>';
-- Expected: 10000
```

### Test 2: Add New Batch (Inbound)
```sql
-- Inbound page'da yangi batch qo'shing: purchase_price=12000

SELECT purchase_price, created_at FROM "Batch" 
WHERE product_id='<product_id>' 
ORDER BY created_at ASC;
-- Expected:
-- Batch 1: 10000 (2026-01-01)
-- Batch 2: 12000 (2026-01-05)
```

### Test 3: Edit Purchase Price (Data Correction)
```bash
1. Open product edit page
2. Change 구매가: 10000 → 15000
3. Save
4. Check backend logs:
```

**Expected console output:**
```
📥 Received DTO for product update: { "purchasePrice": 15000, ... }
🔍 dto.purchasePrice: 15000
🔍 Updating first batch purchase_price from 10000 to 15000
🔍 Updated ProductSupplier purchase_price from 10000 to 15000
```

**Expected database state:**
```sql
SELECT purchase_price FROM "Product" WHERE id='<product_id>';
-- Expected: 15000 ✅

SELECT purchase_price, created_at FROM "Batch" 
WHERE product_id='<product_id>' 
ORDER BY created_at ASC;
-- Expected:
-- Batch 1: 15000 (2026-01-01) ✅ UPDATED!
-- Batch 2: 12000 (2026-01-05) ✅ UNCHANGED!

SELECT purchase_price FROM "ProductSupplier" 
WHERE product_id='<product_id>';
-- Expected: 15000 ✅
```

---

## 📊 Complete Flow Diagram

```
SCENARIO A: Product Creation
┌─────────────────────────┐
│ User creates product    │
│ purchase_price = 10000  │
└───────────┬─────────────┘
            │
            ├──→ Product.purchase_price = 10000
            ├──→ Batch[0].purchase_price = 10000 (first batch)
            └──→ ProductSupplier.purchase_price = 10000

SCENARIO B: New Inbound (Add New Batch)
┌─────────────────────────┐
│ User adds new batch     │
│ purchase_price = 12000  │
└───────────┬─────────────┘
            │
            └──→ Batch[1].purchase_price = 12000 (new batch)
                 
                 Product.purchase_price = 10000 (unchanged)
                 Batch[0].purchase_price = 10000 (unchanged)
                 ProductSupplier.purchase_price = 10000 (unchanged)

SCENARIO C: Edit Page (Data Correction)
┌─────────────────────────┐
│ User edits product      │
│ 구매가: 10000 → 15000   │
└───────────┬─────────────┘
            │
            ├──→ Product.purchase_price = 15000 ✅
            ├──→ Batch[0].purchase_price = 15000 ✅ (FIRST batch only)
            │    Batch[1].purchase_price = 12000 (unchanged, historical)
            └──→ ProductSupplier.purchase_price = 15000 ✅
```

---

## 🎯 Key Design Decisions

### Why Update FIRST Batch (oldest)?
- ✅ First batch was created **with** the product
- ✅ It represents the **original/default** batch
- ✅ Other batches are **separate inbound operations** with their own prices
- ✅ Historical data preserved for later batches

### Why Update ProductSupplier?
- ✅ Edit page is for **data correction**
- ✅ If original price was wrong, supplier contract price was also wrong
- ✅ User needs to correct **entire relationship**, not just product

### Why NOT Update All Batches?
- ✅ Later batches may have **different prices** (price changes over time)
- ✅ Each inbound is a **separate transaction**
- ✅ Historical accuracy maintained

---

## 🔍 Debugging

### Check if update worked:
```sql
-- Product table
SELECT id, name, purchase_price FROM "Product" WHERE name LIKE '%Test%';

-- First batch (oldest)
SELECT b.purchase_price, b.created_at, p.name 
FROM "Batch" b
JOIN "Product" p ON b.product_id = p.id
WHERE p.name LIKE '%Test%'
ORDER BY b.created_at ASC
LIMIT 1;

-- ProductSupplier
SELECT ps.purchase_price, p.name, csm.company_name
FROM "ProductSupplier" ps
JOIN "Product" p ON ps.product_id = p.id
LEFT JOIN "ClinicSupplierManager" csm ON ps.clinic_supplier_manager_id = csm.id
WHERE p.name LIKE '%Test%';
```

### Console logs to check:
```
🔍 dto.purchasePrice: 15000
🔍 Updating first batch purchase_price from 10000 to 15000
🔍 Updated ProductSupplier purchase_price from 10000 to 15000
```

---

## ✅ Implementation Checklist

- [x] Update `Product.purchase_price` (already working)
- [x] Find FIRST batch (oldest, `created_at ASC`)
- [x] Update first batch `purchase_price` if changed
- [x] Find `ProductSupplier` for this product
- [x] Update `ProductSupplier.purchase_price` if changed
- [x] Add comprehensive logging
- [x] Handle cases where batch/supplier doesn't exist
- [ ] Test: Create product with price 10000
- [ ] Test: Add new batch with price 12000
- [ ] Test: Edit product price to 15000
- [ ] Test: Verify only first batch updated, second unchanged
- [ ] Test: Verify ProductSupplier updated

---

**Status:** ✅ Code implemented, ready for testing
**Date:** 2026-01-08
**Priority:** High - Data correction functionality

