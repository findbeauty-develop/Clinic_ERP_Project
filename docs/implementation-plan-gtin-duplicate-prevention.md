# Implementation Plan: Prevent Duplicate Product by Barcode (GTIN)

**Maqsad:** Bir tenant ichida bitta GTIN (barcode) uchun bitta product bo‘lishini ta’minlash. Dublikat yaratilishini app + DB darajasida oldini olish, race condition ni catch orqali hal qilish.

---

## 1. Database

### 1.1 Yangi model: `ProductGTIN`

**Fayl:** `apps/backend/prisma/schema.prisma`

- `ProductGTIN` jadvali qo‘shish:
  - `id` (uuid, PK)
  - `tenant_id` (String)
  - `product_id` (String, FK → Product.id, onDelete: Cascade)
  - `gtin` (String)
  - `@@unique([tenant_id, gtin])`
  - `@@index([tenant_id])`, `@@index([product_id])`
- `Product` modelida: `productGtins ProductGTIN[]` relation qo‘shish.
- **Product.barcode** saqlanadi (backward compatibility): barcode o‘qiladigan barcha joylar o‘zgarishsiz ishlashi uchun. Asl uniqueness faqat `ProductGTIN` da bo‘ladi.

### 1.2 Migration

- `npx prisma migrate dev --name add_product_gtin`
- Migration faylida: `CREATE UNIQUE INDEX ... ON "ProductGTIN"("tenant_id", "gtin")`.

### 1.3 Data migration (mavjud barcode → ProductGTIN)

- Bir martalik skript yoki migration step:
  - `Product` jadvalidan `tenant_id`, `id`, `barcode` ni o‘qib, `barcode IS NOT NULL` bo‘lgan qatorlar uchun `ProductGTIN` ga `(tenant_id, product_id, gtin)` insert.
  - Bir xil tenant ichida bitta barcode bir nechta productda bo‘lsa (bugungi dublikatlar), birinchisini saqlab qolish yoki conflict ni hal qilish strategiyasi belgilash (masalan, eng eski `product_id` ni saqlash).

---

## 2. Backend: Create Product

**Fayl:** `apps/backend/src/modules/product/services/products.service.ts`

### 2.1 Create flow (barcode berilganda)

1. **Pre-check (app-level):**  
   `dto.barcode` trim qilingan bo‘lsa:
   - `ProductGTIN` dan `tenant_id` + `gtin` bo‘yicha `findFirst` (yoki `findUnique` via `tenant_id_gtin`).
   - Topilsa: mavjud productni `getProduct(existing.product_id, tenantId)` orqali to‘ldirib qaytarish, response ga `existingForBarcode: true` (yoki `code: 'PRODUCT_ALREADY_EXISTS_FOR_THIS_BARCODE'`) qo‘shish. **Create qilmaslik.**

2. **Create (barcode yo‘q yoki topilmadi):**  
   Transaction ichida:
   - `Product` yaratish (jumladan `barcode: dto.barcode ?? null` — backward compat).
   - Agar `dto.barcode` bo‘lsa: `ProductGTIN` create (`tenant_id`, `product_id`, `gtin`).
   - Qolgan mantiq (ProductSupplier, batches, returnPolicy) o‘zgarishsiz.

3. **Race condition:**  
   Transaction oxirida yoki `ProductGTIN.create` dan keyin:
   - `try { ... } catch (e) { if (e.code === 'P2002') { ... } throw e; }`.
   - Prisma unique constraint buzilsa `P2002` (PrismaClientKnownRequestError). Catch qilinganda:
     - `ProductGTIN` dan `tenant_id` + `gtin` bo‘yicha topib, `product_id` ni olish.
     - `getProduct(product_id, tenantId)` qaytarish, `existingForBarcode: true` bilan.

4. **Barcode berilmasa:**  
   Hozirgidek: faqat `Product` create (ProductGTIN create qilmaslik). Dublikat oldini olish boshqa mexanizmlarga qoldiriladi.

### 2.2 Response format

- Controller/service qaytgan object ga ixtiyoriy field:
  - `existingForBarcode?: boolean` — `true` bo‘lsa “bu barcode uchun product allaqachon mavjud edi, shu product qaytarildi”.
  - Yoki `code?: 'PRODUCT_ALREADY_EXISTS_FOR_THIS_BARCODE'` (frontend shunga qarab xabar ko‘rsatadi).

---

## 3. Backend: Update Product

**Fayl:** `apps/backend/src/modules/product/services/products.service.ts` — `updateProduct`

- Agar `dto.barcode` berilgan va o‘zgargan bo‘lsa:
  - Yangi barcode boshqa productga tegishli bo‘lmasligi kerak: `ProductGTIN` da `tenant_id` + yangi `gtin` bo‘yicha tekshirish. Topilsa va `product_id !== id` bo‘lsa — `ConflictException` (yoki BadRequest): "Bu barcode boshqa mahsulotga biriktirilgan".
  - Mavjud `ProductGTIN` ni yangilash: `product_id = id` bo‘lgan yozuvni topib, `gtin` ni yangilash; yoki eski GTIN ni o‘chirib, yangisini qo‘shish (bitta product = bitta GTIN bo‘lsa).
  - `Product.barcode` ni ham yangilash (sinxron saqlash).

---

## 4. Backend: Find by Barcode

**Fayl:** `apps/backend/src/modules/product/services/products.service.ts` — `findByBarcode`

- Variant A (minimal o‘zgarish): `Product.barcode` ni sinxron saqlaymiz, shuning uchun hozirgi `product.findFirst({ where: { tenant_id, barcode } })` ishlashi mumkin.
- Variant B (yagona manba ProductGTIN): `ProductGTIN` dan `findFirst({ where: { tenant_id, gtin: barcode } })` → `product_id` → `getProduct(product_id, tenantId)`.  
- **Tavsiya:** Variant B — barcha “barcode” lookuplar `ProductGTIN` orqali bo‘ladi; `Product.barcode` faqat display/export uchun sinxron holda saqlanadi.

---

## 5. Backend: Import (CSV)

**Fayl:** `apps/backend/src/modules/product/services/products.service.ts` — `previewImport`, `confirmImport`

### 5.1 previewImport

- Mavjud “existing barcodes” ni DB dan olish: `ProductGTIN` jadvalidan `tenant_id` bo‘yicha barcha `gtin` larni olish (yoki `Product.barcode` dan, agar hali ProductGTIN ga to‘liq o‘tmagan bo‘lsa — migration dan keyin ProductGTIN dan o‘qish).
- CSV ichida dublikat va DB da mavjud barcode tekshiruvi o‘zgarishsiz; faqat manba `ProductGTIN` (yoki migrationdan keyin ProductGTIN) bo‘ladi.

### 5.2 confirmImport

- Har bir qator uchun: agar `row.barcode?.trim()` bo‘lsa, avval `ProductGTIN` da `tenant_id` + `gtin` bo‘yicha qidirish.
  - **Topilsa:** yangi product yaratmaslik; mavjud `product_id` uchun faqat batch (inbound) yaratish yoki import qoidalariga ko‘ra “skip”/“link to existing” (qanday qilish biznes qaroriga qarab).
  - **Topilmasa:** hozirgi kabi `Product` create, lekin shu bilan birga `ProductGTIN` create qilish (`tenant_id`, `product_id`, `gtin`). Product.barcode ni ham set qilish.
- Race: bir xil barcode bir batch ichida 2 marta kelsa yoki parallel import bo‘lsa — `ProductGTIN.create` da P2002 catch qilib, mavjud productni topib, shu product uchun batch yaratish (yoki xato qaytarish — import rejimi qat’iy bo‘lsa).

---

## 6. Boshqa backend joylar

- **Order, outbound, inbound** va boshqalar: ular `product.barcode` ni o‘qiydi yoki `findByBarcode` dan foydalanadi. `findByBarcode` ProductGTIN orqali bo‘lsa va `Product.barcode` sinxron saqlansa, qo‘shimcha o‘zgarish kerak emas (ixtiyoriy: barcha o‘qishlarni ProductGTIN orqali qilish).
- **GET product by id** va list: `product.barcode` include qilinadi — o‘zgarishsiz.

---

## 7. Frontend

### 7.1 Product create (form / API response)

- Create product API dan qaytgan javobda `existingForBarcode === true` yoki `code === 'PRODUCT_ALREADY_EXISTS_FOR_THIS_BARCODE'` bo‘lsa:
  - “Bu 바코드로 등록된 제품이 이미 있습니다. 해당 제품 정보를 불러왔습니다.” kabi xabar.
  - Form yangi product o‘rniga mavjud product ma’lumotini ko‘rsatish yoki redirect to product detail (mavjud product id).

### 7.2 Product create qayerdan chaqiriladi

- `apps/frontend/app/inbound/new/page.tsx` — barcode bilan yangi mahsulot yaratish.
- `apps/frontend/app/products/` yoki mahsulot qo‘shish modali bo‘lsa — shu joyda ham response ni tekshirish va “already exists” ko‘rsatish.

### 7.3 CSV Import

- Import natijasida “barcode allaqachon mavjud” bo‘lsa, backend “mavjud productga batch qo‘shildi” yoki “skip” qilishi mumkin; frontend buni natija jadvalida (masalan, “기존 제품에 입고 추가” kabi) ko‘rsatishi kerak.

---

## 8. Amaliyot tartibi (step order)

| # | Qadam | Izoh |
|---|--------|------|
| 1 | Schema: ProductGTIN + Product relation | prisma/schema.prisma |
| 2 | Migration yaratish | `prisma migrate dev --name add_product_gtin` |
| 3 | Data migration: Product.barcode → ProductGTIN | Bir martalik skript yoki SQL in migration |
| 4 | createProduct: pre-check (ProductGTIN orqali) | Barcode bo‘lsa topilsa return existing |
| 5 | createProduct: Product + ProductGTIN create, try/catch P2002 | Race: catch da find existing, return |
| 6 | createProduct response: existingForBarcode / code | Controller/service return object |
| 7 | findByBarcode: ProductGTIN orqali qidirish | product_id → getProduct |
| 8 | updateProduct: barcode o‘zgarishi → ProductGTIN + Product.barcode | Uniqueness tekshirish (boshqa productda yo‘qligi) |
| 9 | previewImport: existing barcodes from ProductGTIN | |
| 10 | confirmImport: barcode bo‘lsa find by GTIN; topilsa mavjud productga batch, yo‘q bo‘lsa Product + ProductGTIN + batch; P2002 catch | |
| 11 | Frontend: create product response — existingForBarcode xabar va yo‘naltirish | |
| 12 | Frontend: import natijasi — “기존 제품” ko‘rsatish (agar backend qo‘shsa) | |

---

## 9. Testlar

- Barcode berilmasa: product create — o‘zgarishsiz.
- Barcode beriladi, DB da yo‘q: yangi product + ProductGTIN; 201, existingForBarcode yo‘q.
- Barcode beriladi, DB da bor: create chaqiriladi, mavjud product qaytadi, existingForBarcode: true (yoki code).
- Race: 2 ta bir xil barcode bilan parallel create — biri 201 (yangi), ikkinchisi 200 + mavjud product (yoki 201 + existingForBarcode: true) va P2002 catch.
- Update: barcode yangi qiymatga o‘zgartiriladi, boshqa productda yo‘q — OK; boshqa productda bor — 409/400.
- findByBarcode: ProductGTIN orqali to‘g‘ri product qaytadi.
- Import: barcode mavjud — mavjud productga batch; barcode yangi — Product + ProductGTIN + batch.

---

## 10. Vaqt taxmini

| Bo‘lim | Taxminiy vaqt |
|--------|----------------|
| Schema + migration + data migration | 1–1.5 soat |
| createProduct (pre-check + create + P2002 catch + response) | 1 soat |
| findByBarcode + updateProduct (barcode) | 30 min |
| Import (preview + confirm, GTIN find/create, P2002) | 1 soat |
| Frontend (create + import response) | 30–45 min |
| Test va tuzatishlar | 1 soat |
| **Jami** | **~5–6 soat** |

Bu reja barcha muhim joylarni (DB, create, update, find, import, frontend, race condition) qamrab oladi va ketma-ket bajarish uchun mo‘ljallangan.
