# ✅ INBOUND_QTY IMMUTABLE FIX

## 📋 **Muammo:**

`inbound_qty` (dastlabki kirish miqdori) har safar product edit qilinganda yangilanib, 0 ga tushib qolyapti.

### **Nima Bo'layapti Edi:**

1. ✅ Product yaratildi: `inbound_qty = 100`, `current_stock = 100`
2. ✅ Outbound qilindi: `inbound_qty = 100`, `current_stock = 50`
3. ❌ **Supplier**'ni edit qilindi va Save bosildi
4. ❌ Backend har doim `currentStock` ni qabul qiladi (form'da mavjud)
5. ❌ Backend: `inbound_qty = 50` qilib qo'yadi! (eski 100 yo'qoldi!)

**Bu NOTO'G'RI edi!** `inbound_qty` **immutable** bo'lishi kerak.

---

## 🔧 **Yechim:**

### **Backend Changes:**

#### **1. Product.update - `inbound_qty` yangilanmasligi:**

**Oldingi (NOTO'G'RI) code:**
```typescript
// ❌ NOTO'G'RI: har safar currentStock o'zgarsa inbound_qty ham o'zgaradi
const newInboundQty =
  dto.currentStock !== undefined
    ? dto.currentStock
    : existing.inbound_qty;

await tx.product.update({
  data: {
    inbound_qty: newInboundQty, // ❌ Yangilanmoqda!
  }
});
```

**Yangi (TO'G'RI) code:**
```typescript
// ✅ TO'G'RI: inbound_qty hech qachon yangilanmaydi
// ✅ inbound_qty is IMMUTABLE - never update after creation
// It represents the original inbound quantity and should never change

await tx.product.update({
  data: {
    current_stock: newCurrentStock, // ✅ Faqat current_stock yangilanadi
    // ✅ inbound_qty is IMMUTABLE - not updated during edit
  }
});
```

#### **2. First Batch.update - `inbound_qty` yangilanmasligi:**

**Oldingi (NOTO'G'RI) code:**
```typescript
// ❌ NOTO'G'RI: first batch'ning inbound_qty ham yangilanmoqda
if (dto.currentStock !== undefined) {
  batchUpdateData.inbound_qty = dto.currentStock; // ❌ Yangilanmoqda!
}
```

**Yangi (TO'G'RI) code:**
```typescript
// ✅ TO'G'RI: batch'ning inbound_qty ham immutable
// ✅ inbound_qty is IMMUTABLE for batches too - never update after creation
// It represents the original inbound quantity when the batch was created
```

---

## 📊 **Mantiq:**

### **IMMUTABLE Fields (hech qachon o'zgarmaydi):**
- ✅ `Product.inbound_qty` - dastlabki kirish miqdori (faqat yaratilganda o'rnatiladi)
- ✅ `Batch.inbound_qty` - batch yaratilgandagi miqdor (faqat yaratilganda o'rnatiladi)

### **MUTABLE Fields (o'zgaruvchan):**
- ✅ `Product.current_stock` - hozirgi qoldiq (outbound'da kamayadi)
- ✅ `Batch.qty` - batch'dagi hozirgi qoldiq (outbound'da kamayadi)
- ✅ `Product.purchase_price` - sotib olish narxi (edit qilsa yangilanadi)
- ✅ `Product.storage` - saqlash joyi (edit qilsa yangilanadi)
- ✅ `Product.unit` - o'lchov birligi (edit qilsa yangilanadi)
- ✅ va boshqalar...

---

## 🧪 **Test Qilish:**

### **Test 1: Product Edit (ASOSIY TEST)**

1. ✅ Product yarating: `name = "Test Product"`, `inbound_qty = 100`, `current_stock = 100`
2. ✅ Outbound qiling: `-30` → `current_stock = 70`, `inbound_qty = 100` (o'zgarmaydi)
3. ✅ Product'ni edit qiling: **faqat supplier**'ni o'zgartiring
4. ✅ Save bosing
5. ✅ **KUTILAYOTGAN NATIJA:**
   - `current_stock = 70` (o'zgarmadi)
   - `inbound_qty = 100` (o'zgarmadi!) ✅

### **Test 2: Multiple Edit Cycles**

1. ✅ Product yarating: `inbound_qty = 100`
2. ✅ Outbound qiling: `current_stock = 80`
3. ✅ Edit qiling (supplier): `inbound_qty` hali ham `100` ✅
4. ✅ Outbound qiling: `current_stock = 50`
5. ✅ Edit qiling (storage): `inbound_qty` hali ham `100` ✅
6. ✅ Outbound qiling: `current_stock = 0`
7. ✅ Edit qiling (price): `inbound_qty` hali ham `100` ✅

### **Test 3: Batch'larni Tekshirish**

1. ✅ Product yarating → First batch: `inbound_qty = 100`, `qty = 100`
2. ✅ Outbound qiling → First batch: `inbound_qty = 100`, `qty = 70` ✅
3. ✅ Edit qiling → First batch: `inbound_qty` hali ham `100` ✅

---

## 📁 **O'zgartirilgan Fayllar:**

### **Backend:**
- ✅ `apps/backend/src/modules/product/services/products.service.ts`
  - Line 880-881: `inbound_qty` calculation olib tashlandi
  - Line 899: `inbound_qty` update olib tashlandi
  - Line 1147-1148: First batch `inbound_qty` update olib tashlandi

---

## ✅ **Natija:**

- ✅ `inbound_qty` endi **immutable** (hech qachon o'zgarmaydi)
- ✅ Product edit qilganda faqat **o'zgaruvchan** field'lar yangilanadi
- ✅ Outbound operatsiyalari faqat `current_stock` va `batch.qty` ni kamaytiradi
- ✅ `inbound_qty` tarixi saqlanadi (dastlabki qiymat yo'qolmaydi)

---

## 🎯 **Xulosa:**

**`inbound_qty` = "Dastlabki kirish miqdori"** (immutable, tarixiy ma'lumot)
**`current_stock` = "Hozirgi qoldiq"** (mutable, real-time ma'lumot)

Bu mantiq endi to'g'ri ishlaydi! 🎉

