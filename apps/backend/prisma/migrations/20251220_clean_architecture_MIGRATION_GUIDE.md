# Clean Architecture Migration Guide

## Overview

Bu migration production-safe bo'lib, quyidagi o'zgarishlarni amalga oshiradi:

1. **Product table'ni tozalash**: `supplier_manager_id` va `clinic_supplier_link_id` FK'larni olib tashlash
2. **ClinicSupplierManager'ni mustaqil qilish**: `supplier_id` FK'ni olib tashlash, `company_name` va boshqa field'larni qo'shish
3. **ProductSupplier mapping table**: 1 product = 1 supplier (tenant scope)
4. **ClinicSupplierLink'ni yangilash**: `clinic_supplier_manager_id` qo'shish (traceability uchun)

## Migration Steps

### Step 1: Data Migration (REQUIRED)

```bash
cd apps/backend
npx prisma migrate deploy --name clean_architecture_migration_step1_data
```

**Nima qiladi:**

- `ClinicSupplierManager` table'ga `company_name`, `business_number`, `company_phone`, `company_email`, `company_address` qo'shadi
- Mavjud `Supplier` table'dan ma'lumotlarni `ClinicSupplierManager`'ga ko'chiradi
- `ProductSupplier` table yaratadi
- Mavjud `Product` va `SupplierProduct` data'larini `ProductSupplier`'ga migrate qiladi
- Agar `ClinicSupplierManager` topilmasa, yangi yaratadi
- `ClinicSupplierLink`'ga `clinic_supplier_manager_id` qo'shadi

**Validation:**

- Barcha `Product`'lar uchun `ProductSupplier` mapping bo'lishi kerak
- Barcha `ClinicSupplierManager`'larda `company_name` bo'lishi kerak

### Step 2: Schema Cleanup (REQUIRED)

```bash
npx prisma migrate deploy --name clean_architecture_migration_step2_cleanup
```

**Nima qiladi:**

- `Product` table'dan `supplier_manager_id` va `clinic_supplier_link_id` column'larini o'chiradi
- `ClinicSupplierManager` table'dan `supplier_id` column'ini o'chiradi
- `ProductSupplier`'ga FK constraint'lar qo'shadi
- `ClinicSupplierLink`'ga `clinic_supplier_manager_id` FK qo'shadi
- `ClinicSupplierManager`'ga `linked_supplier_manager_id` FK qo'shadi

**EHTIYOT:** Bu step faqat Step 1 muvaffaqiyatli o'tganidan keyin ishga tushirilishi kerak!

### Step 3: Drop Deprecated Table (OPTIONAL - Run after 1-2 weeks)

```bash
npx prisma migrate deploy --name clean_architecture_migration_step3_drop_deprecated
```

**Nima qiladi:**

- `SupplierProduct` table'ni drop qiladi (deprecated)

**EHTIYOT:** Bu step faqat Step 1 va Step 2 muvaffaqiyatli o'tganidan keyin va production'da bir necha hafta test qilinganidan keyin ishga tushirilishi kerak!

## Prisma Client Regeneration

Har bir migration'dan keyin Prisma client'ni regenerate qilish kerak:

```bash
cd apps/backend
npx prisma generate
```

## Rollback Strategy

Agar muammo bo'lsa, rollback script ishlatilishi mumkin:

```bash
cd apps/backend
psql $DATABASE_URL -f prisma/migrations/20251220_clean_architecture_rollback.sql
```

**EHTIYOT:** Rollback qilishdan oldin database backup olishni unutmang!

## Source of Truth Rules

### Purchase Price

- **ProductSupplier.purchase_price** - Product-specific supplier price (source of truth)
- **Product.purchase_price** - Default/fallback price (agar `ProductSupplier.purchase_price` bo'lmasa)

**Logic:**

```typescript
const purchasePrice = productSupplier?.purchase_price ?? product.purchase_price;
```

### Supplier Information

- **ProductSupplier.clinic_supplier_manager_id** - Product uchun supplier (source of truth)
- **ClinicSupplierManager.company_name** - Supplier company name (denormalized)
- **ClinicSupplierManager.linked_supplier_manager_id** - Platform supplier (agar claimed bo'lsa)

## Claim Flow

1. Clinic `ClinicSupplierManager` yaratadi (manual contact)
2. Supplier platformada ro'yxatdan o'tadi (`SupplierManager` yaratiladi)
3. Claim qilinadi: `ClinicSupplierManager.linked_supplier_manager_id = SupplierManager.id`
4. `ProductSupplier` mapping buzilmaydi (chunki `clinic_supplier_manager_id` o'zgarmaydi)

## Testing Checklist

- [ ] Step 1 migration muvaffaqiyatli o'tdi
- [ ] Barcha Product'lar uchun ProductSupplier mapping bor
- [ ] Barcha ClinicSupplierManager'larda company_name bor
- [ ] Step 2 migration muvaffaqiyatli o'tdi
- [ ] Product table'dan FK'lar o'chirildi
- [ ] ClinicSupplierManager table'dan supplier_id o'chirildi
- [ ] Backend code yangilandi va test qilindi
- [ ] Frontend yangilandi va test qilindi
- [ ] Production'da 1-2 hafta test qilindi
- [ ] Step 3 migration (optional) ishga tushirildi

## Troubleshooting

### Error: "Some products do not have ProductSupplier mapping!"

**Sabab:** Step 1 migration'da ba'zi Product'lar uchun `ProductSupplier` yaratilmagan.

**Yechim:**

```sql
-- Qaysi Product'lar uchun ProductSupplier yo'qligini tekshirish
SELECT p.id, p.name, p.tenant_id
FROM "Product" p
WHERE NOT EXISTS (
  SELECT 1 FROM "ProductSupplier" ps WHERE ps.product_id = p.id
);

-- Manual yaratish (agar kerak bo'lsa)
-- Step 1 migration script'idagi Step 3.5 va 3.6 qismlarini qayta ishga tushirish
```

### Error: "NOT NULL violation" during migration

**Sabab:** `ClinicSupplierManager.company_name` NULL bo'lishi mumkin.

**Yechim:**

```sql
-- NULL company_name'larni to'ldirish
UPDATE "ClinicSupplierManager"
SET company_name = '공급업체 없음'
WHERE company_name IS NULL;
```

### Error: Foreign key constraint violation

**Sabab:** FK constraint'lar o'chirilishdan oldin data migrate qilinmagan.

**Yechim:** Step 1 migration'ni qayta ishga tushirish (idempotent bo'lishi kerak).

## Notes

- Migration script'lar **idempotent** - bir necha marta ishga tushirilishi mumkin
- `IF NOT EXISTS` va `IF EXISTS` check'lar ishlatilgan
- Production'da migration qilishdan oldin **backup** olishni unutmang!
- Step 3 (drop deprecated) faqat keyinroq ishga tushirilishi kerak
