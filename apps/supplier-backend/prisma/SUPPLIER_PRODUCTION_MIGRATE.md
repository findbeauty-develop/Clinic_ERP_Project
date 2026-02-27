# Supplier-backend: Production migrate

## "Migration from the database are not found locally" xatosi

Agar `npx prisma migrate status` da quyidagi chiqsa:

```
The migration from the database are not found locally in prisma/migrations:
20250122000000_add_logo_url_to_clinic
```

Bu **clinic backend** migration nomi — production supplier DB ga noto‘g‘ri qo‘llangan (yoki boshqa loyihadan qolgan). Supplier-backend da bunday fayl yo‘q.

### Yechim: ghost migration yozuvini o‘chirish

Production DB da (Supabase SQL Editor yoki psql) bajarish:

```sql
DELETE FROM "_prisma_migrations"
WHERE migration_name = '20250122000000_add_logo_url_to_clinic';
```

Keyin:

```bash
cd apps/supplier-backend
export DATABASE_URL="postgresql://..."   # production URL
npx prisma migrate status                # endi "in sync" yoki faqat "not yet applied" bo‘ladi
npx prisma migrate deploy               # 20260226_supplier_orderitem_confirmed_quantity_nullable qo‘llanadi
```

---

## Oddiy deploy (ghost yo‘q bo‘lsa)

```bash
cd apps/supplier-backend
export DATABASE_URL="postgresql://postgres.xxx:...@...pooler.supabase.com:5432/postgres"
npx prisma migrate deploy
```
