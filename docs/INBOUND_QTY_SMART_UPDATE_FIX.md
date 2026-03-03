# ✅ INBOUND_QTY SMART UPDATE FIX

## 📋 **To'g'ri Mantiq:**

`inbound_qty` **IMMUTABLE** bo'lishi kerak, **LEKIN**:
- ✅ User edit page'da **"제품 재고 수량"** field'ni o'zgartirsa → `inbound_qty` yangilanadi
- ✅ User **boshqa field'larni** o'zgartirsa (supplier, storage, etc.) → `inbound_qty` o'zgarmaydi
- ✅ **Outbound operatsiyalari** → `inbound_qty` o'zgarmaydi (faqat `current_stock` kamayadi)

---

## 🔧 **Implementatsiya:**

### **Backend Logic (`products.service.ts`):**

#### **1. Stock O'zgarganini Aniqlash:**

```typescript
// ✅ Update inbound_qty ONLY if user explicitly changed the stock field
// If currentStock is different from existing, user edited it manually on edit page
const stockWasChanged =
  dto.currentStock !== undefined &&
  dto.currentStock !== existing.current_stock;

const newInboundQty = stockWasChanged
  ? dto.currentStock                // User stockni o'zgartirdi → inbound_qty yangilash
  : (existing as any).inbound_qty;  // User stockni o'zgartirmadi → eski qiymat saqlanadi

console.log(
  "🔍 Stock changed:",
  stockWasChanged,
  "| Updating inbound_qty from",
  existing.inbound_qty,
  "to",
  newInboundQty
);
```

**Mantiq:**
- `dto.currentStock === existing.current_stock` → Stock o'zgarmadi → `inbound_qty` o'zgarmaydi ✅
- `dto.currentStock !== existing.current_stock` → Stock o'zgardi → `inbound_qty` yangilanadi ✅

#### **2. Product Table'ni Yangilash:**

```typescript
await tx.product.update({
  where: { id },
  data: {
    current_stock: newCurrentStock,
    inbound_qty: newInboundQty, // ✅ Update ONLY if user manually edited stock
    // ... other fields
  }
});
```

#### **3. First Batch'ni Yangilash:**

```typescript
if (firstBatch) {
  const batchUpdateData: any = {};

  // ✅ Update inbound_qty ONLY if user explicitly changed stock on edit page
  if (stockWasChanged) {
    batchUpdateData.inbound_qty = dto.currentStock;
    console.log(
      "🔍 Updating first batch inbound_qty from",
      firstBatch.inbound_qty,
      "to",
      dto.currentStock
    );
  }

  // Update other fields (purchase_price, storage, etc.)
  // ...

  if (Object.keys(batchUpdateData).length > 0) {
    await tx.batch.update({
      where: { id: firstBatch.id },
      data: batchUpdateData,
    });
  }
}
```

---

## 🧪 **Test Scenariolar:**

### **Test 1: Faqat Supplier Edit Qilish (Stock O'zgarmaydi)**

**Steps:**
1. ✅ Product yarating: `current_stock = 100`, `inbound_qty = 100`
2. ✅ Outbound qiling: `-30` → `current_stock = 70`, `inbound_qty = 100`
3. ✅ Edit page'da **faqat supplier**'ni o'zgartiring (stock field'ga tegmaslik!)
4. ✅ Save bosing

**Kutilayotgan Natija:**
- `current_stock = 70` (o'zgarmadi) ✅
- `inbound_qty = 100` (o'zgarmadi!) ✅
- `stockWasChanged = false` (console'da ko'rinadi)

---

### **Test 2: Stock Field'ni Edit Qilish**

**Steps:**
1. ✅ Product yarating: `current_stock = 100`, `inbound_qty = 100`
2. ✅ Outbound qiling: `-30` → `current_stock = 70`, `inbound_qty = 100`
3. ✅ Edit page'da **"제품 재고 수량"** field'ni `70` dan `150` ga o'zgartiring
4. ✅ Save bosing

**Kutilayotgan Natija:**
- `current_stock = 150` (yangilandi) ✅
- `inbound_qty = 150` (yangilandi!) ✅
- `stockWasChanged = true` (console'da ko'rinadi)
- First batch: `inbound_qty = 150` (yangilandi) ✅

---

### **Test 3: Stock Field'ni O'zgartirmasdan Boshqa Field'larni Edit Qilish**

**Steps:**
1. ✅ Product: `current_stock = 50`, `inbound_qty = 100`
2. ✅ Edit page'da:
   - Supplier → yangi supplier tanlash ✅
   - Storage → "Warehouse A" → "Warehouse B" ✅
   - Unit → "EA" → "BOX" ✅
   - **Stock field'ga tegmaslik!** (50 qoladi)
3. ✅ Save bosing

**Kutilayotgan Natija:**
- Supplier → yangilandi ✅
- Storage → yangilandi ✅
- Unit → yangilandi ✅
- `current_stock = 50` (o'zgarmadi) ✅
- `inbound_qty = 100` (o'zgarmadi!) ✅
- `stockWasChanged = false`

---

### **Test 4: Outbound Operatsiyasi (Backend'da boshqa joyda)**

**Steps:**
1. ✅ Product: `current_stock = 100`, `inbound_qty = 100`
2. ✅ Outbound qiling: `-40`

**Kutilayotgan Natija:**
- `current_stock = 60` (kamaydi) ✅
- `inbound_qty = 100` (o'zgarmaydi!) ✅
- Outbound service `inbound_qty` ga tegmaydi ✅

---

### **Test 5: Stock'ni 0 ga O'zgartirish**

**Steps:**
1. ✅ Product: `current_stock = 50`, `inbound_qty = 100`
2. ✅ Edit page'da stock'ni `0` ga o'zgartiring
3. ✅ Save bosing

**Kutilayotgan Natija:**
- `current_stock = 0` (0 ga o'zgaradi) ✅
- `inbound_qty = 0` (0 ga o'zgaradi!) ✅
- `stockWasChanged = true` (50 !== 0)

---

### **Test 6: Stock'ni Asl Qiymatiga Qaytarish**

**Steps:**
1. ✅ Product: `current_stock = 50`, `inbound_qty = 100`
2. ✅ Edit page'da stock'ni `50` dan `100` ga o'zgartiring (asl inbound_qty ga qaytarish)
3. ✅ Save bosing

**Kutilayotgan Natija:**
- `current_stock = 100` (100 ga o'zgaradi) ✅
- `inbound_qty = 100` (100 ga o'zgaradi!) ✅
- `stockWasChanged = true` (50 !== 100)

---

## 📁 **O'zgartirilgan Fayllar:**

### **Backend:**
- ✅ `apps/backend/src/modules/product/services/products.service.ts`
  - **Line 880-895**: Smart `stockWasChanged` logic qo'shildi
  - **Line 913**: `inbound_qty: newInboundQty` - conditional update
  - **Line 1161-1170**: First batch `inbound_qty` - conditional update

---

## 🎯 **Console Logs (Debugging uchun):**

Edit operatsiyasida console'da quyidagilar ko'rinadi:

### **Agar Stock O'zgarmagan Bo'lsa:**
```
🔍 Updating current_stock from 70 to 70
🔍 Stock changed: false | Updating inbound_qty from 100 to 100
```

### **Agar Stock O'zgargan Bo'lsa:**
```
🔍 Updating current_stock from 70 to 150
🔍 Stock changed: true | Updating inbound_qty from 100 to 150
🔍 Updating first batch inbound_qty from 100 to 150
```

---

## ✅ **Natija:**

1. ✅ `inbound_qty` endi **AQLLI** tarzda yangilanadi
2. ✅ User **stock field'ni edit qilsa** → `inbound_qty` yangilanadi
3. ✅ User **boshqa field'larni edit qilsa** → `inbound_qty` o'zgarmaydi
4. ✅ **Outbound** operatsiyalari → `inbound_qty` o'zgarmaydi
5. ✅ Console log'lar orqali qachon yangilanganini ko'rish mumkin

---

## 🚀 **Keyingi Qadam:**

**Test qiling!** Yuqoridagi 6 ta test scenarioni bajaring va natijalarni tekshiring! 🎉

