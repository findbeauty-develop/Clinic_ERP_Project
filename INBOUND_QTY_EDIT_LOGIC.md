# Product Stock Edit - Correct Logic Implementation

## 📋 Requirements (Clarified)

### ❌ WRONG Initial Understanding:
- `inbound_qty` is **immutable** (never changes)
- Only `current_stock` changes

### ✅ CORRECT Final Understanding:
1. **Outbound operation** → `inbound_qty` stays same, `current_stock` decreases
2. **Manual edit** → BOTH `inbound_qty` and `current_stock` update

---

## 🎯 Correct Behavior

### Scenario 1: Outbound Operation
```
Initial state:
  Product.inbound_qty = 100
  Product.current_stock = 100

After outbound -20:
  Product.inbound_qty = 100  ← UNCHANGED ✅
  Product.current_stock = 80  ← DECREASED ✅
```

### Scenario 2: Manual Edit (제품 재고 수량)
```
Initial state:
  Product.inbound_qty = 100
  Product.current_stock = 100
  Latest Batch.inbound_qty = 100

User edits 제품 재고 수량: 100 → 150

After save:
  Product.inbound_qty = 150  ← UPDATED ✅
  Product.current_stock = 150  ← UPDATED ✅
  Latest Batch.inbound_qty = 150  ← UPDATED ✅
```

---

## 🔧 Implementation

### Backend Changes (`products.service.ts`)

#### 1. Calculate new inbound_qty
```typescript
const newCurrentStock =
  dto.currentStock !== undefined
    ? dto.currentStock
    : existing.current_stock;

// ✅ Update inbound_qty when manually editing
const newInboundQty =
  dto.currentStock !== undefined
    ? dto.currentStock
    : (existing as any).inbound_qty;

console.log("🔍 Updating current_stock from", existing.current_stock, "to", newCurrentStock);
console.log("🔍 Updating inbound_qty from", (existing as any).inbound_qty, "to", newInboundQty);
```

#### 2. Update Product table
```typescript
await tx.product.update({
  where: { id },
  data: {
    current_stock: newCurrentStock,
    inbound_qty: newInboundQty, // ← NEW: Update inbound_qty
    // ... other fields
  }
});
```

#### 3. Update Latest Batch
```typescript
// ✅ Update latest batch's inbound_qty when manually editing stock
if (dto.currentStock !== undefined) {
  const latestBatch = await tx.batch.findFirst({
    where: { product_id: id, tenant_id: tenantId },
    orderBy: { created_at: "desc" },
  });

  if (latestBatch) {
    await tx.batch.update({
      where: { id: latestBatch.id },
      data: { inbound_qty: dto.currentStock },
    });
    console.log(
      "🔍 Updated latest batch inbound_qty from",
      latestBatch.inbound_qty,
      "to",
      dto.currentStock
    );
  }
}
```

---

## 🧪 Testing Steps

### Test 1: Verify Outbound Does NOT Change inbound_qty
1. Create product with stock = 100
2. Check database:
   ```sql
   SELECT inbound_qty, current_stock FROM "Product" WHERE id = '<id>';
   -- Should show: inbound_qty=100, current_stock=100
   ```
3. Do outbound operation -20
4. Check database again:
   ```sql
   SELECT inbound_qty, current_stock FROM "Product" WHERE id = '<id>';
   -- Should show: inbound_qty=100, current_stock=80
   ```
5. ✅ **Expected:** `inbound_qty` unchanged, `current_stock` decreased

### Test 2: Verify Manual Edit DOES Change inbound_qty
1. Go to product edit page
2. Change 제품 재고 수량: 80 → 150
3. Save
4. Check backend logs:
   ```
   🔍 dto.currentStock: 150
   🔍 Updating current_stock from 80 to 150
   🔍 Updating inbound_qty from 100 to 150
   🔍 Updated latest batch inbound_qty from 100 to 150
   ```
5. Check database:
   ```sql
   SELECT inbound_qty, current_stock FROM "Product" WHERE id = '<id>';
   -- Should show: inbound_qty=150, current_stock=150
   
   SELECT inbound_qty, qty FROM "Batch" WHERE product_id = '<id>' 
   ORDER BY created_at DESC LIMIT 1;
   -- Should show: inbound_qty=150, qty=150
   ```
6. ✅ **Expected:** BOTH `inbound_qty` and `current_stock` updated

### Test 3: Verify Detail Page Shows Correct Values
1. After editing, refresh product detail page
2. Check "제품 재고 수량" field shows 150 (not 100)
3. Check "입고수량" in batch list shows 150 (not 100)
4. ✅ **Expected:** All fields show updated values

---

## 🎯 Key Points

### Why This Logic Makes Sense:

1. **Outbound = Stock Movement**
   - Real physical stock is being moved out
   - Original inbound quantity stays for history
   - Only available stock decreases

2. **Manual Edit = Correction/Adjustment**
   - User is correcting the actual quantity
   - Both original record AND current stock should update
   - This is a data correction, not a movement

### Database Updates:
```
Edit Operation Updates:
├── Product.inbound_qty ← NEW qty
├── Product.current_stock ← NEW qty
└── Latest Batch.inbound_qty ← NEW qty

Outbound Operation Updates:
└── Product.current_stock ← DECREASED qty
    (inbound_qty untouched)
```

---

## 📊 Console Output Examples

### During Manual Edit:
```
Frontend:
🔍 formData.currentStock: "150"
🔍 Converted currentStock: 150
📦 Payload being sent to backend: { "currentStock": 150, ... }

Backend:
📥 Received DTO for product update: { "currentStock": 150, ... }
🔍 dto.currentStock: 150
🔍 typeof dto.currentStock: number
🔍 Updating current_stock from 80 to 150
🔍 Updating inbound_qty from 100 to 150
🔍 Updated latest batch inbound_qty from 100 to 150
```

---

## ✅ Checklist

- [x] Backend updates `Product.inbound_qty` during edit
- [x] Backend updates `Product.current_stock` during edit
- [x] Backend updates `Batch.inbound_qty` during edit
- [x] Outbound operation still only affects `current_stock`
- [x] Debug logs added for verification
- [ ] Test outbound operation (verify inbound_qty unchanged)
- [ ] Test manual edit (verify both fields update)
- [ ] Verify database values
- [ ] Verify frontend display

---

**Status:** ✅ Code implemented, ready for testing
**Date:** 2026-01-08
**Critical:** Test BOTH scenarios (outbound vs manual edit)

