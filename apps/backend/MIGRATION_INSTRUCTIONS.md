# Return Model Migration Qo'llash Qo'llanmasi

## Muammo
`prisma migrate dev` va `prisma migrate deploy` database bilan bog'lanishda timeout bo'lyapti.

## Yechim: Manual Migration

### QADAM 1: Supabase Dashboard orqali SQL qo'llash

1. Supabase Dashboard'ga kiring: https://supabase.com/dashboard
2. Project'ni tanlang
3. **SQL Editor** ga o'ting
4. Quyidagi SQL kodini copy qiling va **RUN** qiling:

```sql
-- CreateTable
CREATE TABLE IF NOT EXISTS "Return" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "outbound_id" TEXT,
    "batch_no" TEXT NOT NULL,
    "supplier_id" TEXT,
    "return_qty" INTEGER NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refund_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_refund" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manager_name" TEXT NOT NULL,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "created_by" TEXT,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Return_tenant_id_idx" ON "Return"("tenant_id");
CREATE INDEX IF NOT EXISTS "Return_product_id_idx" ON "Return"("product_id");
CREATE INDEX IF NOT EXISTS "Return_batch_id_idx" ON "Return"("batch_id");
CREATE INDEX IF NOT EXISTS "Return_outbound_id_idx" ON "Return"("outbound_id");
CREATE INDEX IF NOT EXISTS "Return_return_date_idx" ON "Return"("return_date");
CREATE INDEX IF NOT EXISTS "Return_tenant_id_return_date_idx" ON "Return"("tenant_id", "return_date");

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Return" ADD CONSTRAINT "Return_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Return" ADD CONSTRAINT "Return_outbound_id_fkey" FOREIGN KEY ("outbound_id") REFERENCES "Outbound"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

### QADAM 2: Migration History'ga qo'shish

SQL Editor'da quyidagi kodni ham run qiling:

```sql
-- Migration ni resolve qilish
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  '20250120000000_add_return_model',
  'manual',
  NOW(),
  '20250120000000_add_return_model',
  NULL,
  NULL,
  NOW(),
  1
) ON CONFLICT (id) DO NOTHING;
```

### QADAM 3: Tekshirish

```bash
cd apps/backend
pnpm exec prisma generate
pnpm exec prisma migrate status
```

## Alternativ: psql orqali

Agar psql o'rnatilgan bo'lsa:

```bash
cd apps/backend
psql "postgresql://postgres.hroxrgxzdxxxuvhxleow:Khisl(@)t2907@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true" < prisma/migrations/20250120000000_add_return_model/migration.sql
```

## Xulosa

Migration muvaffaqiyatli qo'llanganidan keyin:
- ✅ Return jadvali yaratiladi
- ✅ Index'lar yaratiladi
- ✅ Foreign key'lar yaratiladi
- ✅ Prisma client generate qilinadi
- ✅ Backend API ishlaydi

