# Production databasega xavfsiz migrate qilish

Develop databasedagi barcha migration'larni production'ga xavfsiz o‘tkazish bo‘yicha qisqa qo‘llanma.
DATABASE_URL="postgresql://postgres.ufktzxsegywvtclpwrvd:Vkdlsqbxl123%21%40@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres" npx prisma migrate status
DATABASE_URL="postgresql://postgres.ufktzxsegywvtclpwrvd:Vkdlsqbxl123%21%40@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres" npx prisma migrate deploy

---

## 1. Production backup (majburiy)

Migrate dan **oldingin** production DB ning backup'ini oling.

- **Supabase**: Dashboard → Project → Database → Backups (yoki Settings → Database → Create backup).
- **Boshqa hosting**: `pg_dump` bilan full dump oling:
  ```bash
  pg_dump "$PRODUCTION_DATABASE_URL" -F c -f backup_$(date +%Y%m%d_%H%M).dump
  ```

Agar migrate xato bersa, shu backup'dan qayta tiklaysiz.

---

## 2. Production uchun connection

Prisma migrate **to‘g‘ridan-to‘g‘ri** ulanishi kerak (pooler emas).

- Supabase: **Direct connection** — port `5432`, host `db.xxx.supabase.co` (`.co`).
- `.env.production` yoki deploy paytida:
  ```env
  DATABASE_URL="postgresql://postgres.[project-ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres"
  ```
  Yoki Supabase Dashboard → Settings → Database → "Connection string" → **URI** (Transaction mode, port 5432).

Migrate ni **pooler** (port 6543, `pgbouncer=true`) bilan ishlamang — osilishi mumkin.

---

## 3. Migrate qilish (ikki yo‘l)

### Yo‘l A: Prisma CLI (birinchi urinish)

Production DB URL'ini to‘g‘ri (direct) qo‘yib:

```bash
cd apps/backend
export DATABASE_URL="postgresql://..."   # production, direct connection
npx prisma migrate status                # qaysi migration'lar qo‘yilganini ko‘ring
npx prisma migrate deploy                # qolgan migration'larni qo‘yadi
```

Agar `migrate deploy` **tez** (1–2 daqiqa ichida) tugasa — hammasi yaxshi. Keyin 4-qadamga o‘ting.

Agar **osilib** qolsa (hech narsa bo‘lmaydi) → **Yo‘l B** ga o‘ting.

---

### Yo‘l B: Qo‘lda SQL + baseline (CLI osilsa)

Loyihada buni **MIGRATION_STRATEGY.md** batafsil tushuntiradi. Qisqacha:

1. **Production DB da qaysi migration'lar qo‘yilganini** bilib oling:
   - Supabase SQL Editor:
     ```sql
     SELECT migration_name, finished_at
     FROM _prisma_migrations
     ORDER BY finished_at;
     ```
   - Yoki `prisma migrate status` boshqa (masalan, develop) DB ga ulab, production bilan solishtirib qarang.

2. **Qo‘yilmagan** migration'lar uchun:
   - Har biri uchun `prisma/migrations/<FOLDER>/migration.sql` faylini oching.
   - SQL'ni **Supabase Dashboard → SQL Editor** da ishga tushiring (bitta-bitta, tartibda).

3. **Baseline** qiling (Prisma bu migration'lar qo‘yilgan deb yozishi uchun):
   - `MIGRATION_STRATEGY.md` dagi `baseline-migration.js` skriptidan foydalaning.
   - Yoki SQL Editor'da har bir qo‘yilgan migration uchun:
     ```sql
     INSERT INTO _prisma_migrations (
       id, checksum, finished_at, migration_name, logs,
       rolled_back_at, started_at, applied_steps_count
     ) VALUES (
       gen_random_uuid()::text, '', NOW(), 'MIGRATION_FOLDER_NAME',
       'manually applied', NULL, NOW(), 1
     );
     ```
     Bu yerdagi `MIGRATION_FOLDER_NAME` — masalan: `20260225000000_add_has_expiry_period_to_product`.

4. Barcha yangi migration'lar qo‘yilgach yana:
   ```bash
   npx prisma migrate status
   ```
   Barchasi "applied" bo‘lishi kerak.

---

## 4. Migrate'dan keyin

- [ ] `npx prisma generate` (backend'da).
- [ ] Backend'ni qayta ishga tushiring (yangi Prisma Client ishlashi uchun).
- [ ] Production'da muhim ekranlarni tekshirib chiqing (login, inbound, order va hokazo).

---

## 5. Xulosa

| Qadam | Nima qilish                                                                             |
| ----- | --------------------------------------------------------------------------------------- |
| 1     | Production DB backup                                                                    |
| 2     | `DATABASE_URL` = production, **direct** (5432)                                          |
| 3     | `prisma migrate status` → keyin `prisma migrate deploy`; osilsa → qo‘lda SQL + baseline |
| 4     | `prisma generate` + backend restart + tekshiruv                                         |

Batafsil qoidalar va rollback: **MIGRATION_STRATEGY.md**.
