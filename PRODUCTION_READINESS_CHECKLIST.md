# 🚀 PRODUCTION READINESS CHECKLIST
## Clinic ERP Project - Haqiqiy Userlar uchun Tayyorlik

**Oxirgi yangilanish:** 2026-03-03  
**Maqsad:** Production'ga chiqishdan oldin barcha muhim muammolarni aniqlash va hal qilish

---

## ⚠️ KRITIK MUAMMOLAR (HAL QILISH KERAK!)

### 🔴 1. Supplier Backend Schema Mismatch (YUQORI PRIORITET)
**Muammo:**
```
Error: Null constraint violation on the fields: (quantity)
```

**Sabab:**
- `apps/backend/prisma/schema.prisma` - `OrderItem` model yangilangan (quantity fieldlari refactored)
- `apps/supplier-backend/prisma/schema.prisma` - Eski schema ishlatyapti
- Production supplier-backend database schema eskiriganligidan order yaratishda crash bo'ladi

**Oqibatlari:**
- ❌ Cliniclar order yarata olmaydi
- ❌ Supplier orderlarni qabul qila olmaydi
- ❌ Butun order flow ishlamaydi

**Yechim (3 ta usul):**

#### Option 1: Migration (Tavsiya etiladi) ✅
```bash
# VPS'da supplier-backend'ga SSH orqali kiring
cd /path/to/supplier-backend
npx prisma migrate dev --name sync_order_item_schema
npx prisma generate
```

#### Option 2: Database Reset (Agar test muhitida bo'lsa)
```bash
npx prisma migrate reset --force
npx prisma generate
```

#### Option 3: Manual Database Sync
```sql
-- supplier-backend databasesida ishga tushiring
ALTER TABLE "OrderItem" 
  DROP COLUMN IF EXISTS "quantity",
  ADD COLUMN "ordered_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "confirmed_quantity" INTEGER,
  ADD COLUMN "inbound_quantity" INTEGER,
  ADD COLUMN "pending_quantity" INTEGER;
```

**Status:** 🔴 HAL QILINMAGAN

---

### 🟡 2. Supabase Storage Production Setup (ORTA PRIORITET)

**Muammo:**
- Development'da bucket yaratildi ✅
- Production'da bucket yaratilmagan ❌

**Oqibatlari:**
- Product imagelar Supabase'ga save bo'lmaydi
- Local storage'ga fallback bo'ladi (restart'da yo'qoladi)
- Logo va certificate imagelar ko'rinmay qoladi

**Yechim:**
```bash
# Production environment uchun
cd apps/backend
node scripts/create-supabase-bucket.js production
```

**Tekshirish:**
1. Production `.env` fileida:
   - `SUPABASE_URL` to'g'ri configured
   - `SUPABASE_SERVICE_ROLE_KEY` to'g'ri configured
2. Backend loglarida: `✅ Supabase Storage initialized` ko'rinadi
3. Image upload qilganda error chiqmaydi

**Status:** 🟡 PRODUCTION'DA TEST QILISH KERAK

---

### 🟡 3. Email Provider Not Configured (ORTA PRIORITET)

**Muammo:**
`.env` faylida email providerlar comment qilingan:
```env
# EMAIL_PROVIDER=brevo
# BREVO_API_KEY=...
```

**Oqibatlari:**
- Member credentials (login/password) email yuborilmaydi
- Password reset emaillar ishlamaydi
- Order notification emaillar yuborilmaydi
- Support inquiry confirmations yuborilmaydi

**Yechim:**
1. Brevo yoki AWS SES'dan birini tanlang
2. `.env` faylida comment'larni oching:

**Option A: Brevo (Oson, bepul tier bor)**
```env
EMAIL_PROVIDER=brevo
BREVO_API_KEY=xkeysib-...
BREVO_FROM_EMAIL=noreply@jaclit.com
BREVO_FROM_NAME=www.jaclit.com
```

**Option B: AWS SES (Professional, ko'proq volume uchun)**
```env
EMAIL_PROVIDER=amazon-ses
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-2
AWS_SES_FROM_EMAIL=noreply@jaclit.com
```

**Status:** 🟡 CONFIGURE QILISH KERAK

---

## 🟢 KICHIK MUAMMOLAR (Hal qilish tavsiya etiladi)

### 4. Cache Invalidation Consistency

**Muammo:**
- Frontend'da faqat 2 ta joyda `invalidateCache` ishlatilgan
- Backend'da 3 ta serviceda cache invalidation bor
- Ko'p joylarda cache invalidation unutilgan (masalan: product delete, batch update, etc.)

**Oqibatlari:**
- Userlar o'zgarishlarni ko'rish uchun page refresh qilishi kerak
- Eski datalar ko'rinishi mumkin

**Yechim:**
- Backend'da CRUD operationlardan keyin cache invalidation qo'shish
- Frontend'da critical updatelardan keyin cache invalidation

**Qayerda kerak:**
```typescript
// Product operations
await this.productService.delete(id);
invalidateCache('products'); // ❌ Yo'q

// Batch operations
await this.batchService.update(id, data);
invalidateCache('batches'); // ❌ Yo'q

// Supplier operations
await this.supplierService.updateStatus(id, status);
invalidateCache('suppliers'); // ❌ Yo'q
```

**Status:** 🟢 OPTIONAL (UX improvement)

---

### 5. Docker Volume for Uploads (Resolved, but verify)

**Holat:**
```yaml
volumes:
  - backend-uploads:/app/apps/backend/uploads
```

**Tekshirish:**
1. Supabase Storage ishlayaptimi?
2. Agar Supabase fail bo'lsa, local storage fallback ishlayaptimi?
3. Docker restart qilganda imagelar saqlanib qoladimi?

**Status:** 🟢 CONFIGURED (verify in production)

---

### 6. FIFO (First-In, First-Out) Not Implemented

**Muammo:**
- User so'ragan FIFO logic implement qilinmagan
- Outbound paytida eng eski lot (yaqin expiry date) birinchi ishlatilmaydi
- Manual lot selection qilinadi

**Oqibatlari:**
- Productlar expire bo'lib qolishi mumkin
- Inventory waste ko'payadi

**Yechim (Kelajak uchun):**
1. Outbound logic'da automatic lot selection based on:
   - `expiry_date` (earliest first)
   - `inbound_date` (oldest first)
2. UI'da FIFO policy toggle (manual/auto mode)

**Status:** 🟢 FEATURE REQUEST (future enhancement)

---

## 🔒 SECURITY TEKSHIRUVI

### ✅ To'g'ri Configured:

1. **JWT Authentication:**
   - `JWT_SECRET` configured ✅
   - Token expiry reasonable (15m access, 7d refresh) ✅

2. **CORS:**
   - Production domains whitelisted ✅
   - Localhost'lar ishlatilmagan ✅

3. **API Keys:**
   - `SUPPLIER_BACKEND_API_KEY` configured ✅
   - Rate limiting active ✅

4. **Cyber Attack Detection:**
   - Brute force threshold: 5 attempts/15min ✅
   - DDoS threshold: 100 req/min ✅
   - IP whitelist configured ✅

5. **Telegram Monitoring:**
   - Telegram bot configured ✅
   - `NODE_ENV=production` check ✅

### ⚠️ Tekshirish Kerak:

1. **Environment Variables in Production:**
   - `.env` file Docker image'ga kiritilmaganligini tekshiring
   - VPS'da `.env` fileni manual copy qiling
   - `.dockerignore` to'g'ri configured (✅ verified)

2. **Supabase Credentials:**
   - `SUPABASE_SERVICE_ROLE_KEY` - Bu production key emasligini tekshiring
   - Development va production uchun alohida key'lar bo'lishi kerak

3. **Google Cloud Credentials:**
   - `GOOGLE_APPLICATION_CREDENTIALS=./keys/clinic-ocr-prod-aeccdd231e2e.json`
   - Bu file Docker volume orqali mount qilinganligini tekshiring ✅

---

## 📊 MONITORING VA ALERTING

### ✅ Configured:

1. **Prometheus** (Port 9090) - Metrics collection ✅
2. **Grafana** (Port 3004) - Visualization ✅
3. **PostgreSQL Exporter** (Port 9187) - DB metrics ✅
4. **Telegram Alerts** - Production errors ✅

### ⚠️ Setup Kerak:

1. **Grafana Dashboards:**
   - Login: `http://your-vps-ip:3004`
   - Username: `admin`
   - Password: `.env` faylidagi `GRAFANA_ADMIN_PASSWORD`
   - Dashboardlar import qilish kerak

2. **Supabase Storage Monitoring:**
   - `SUPABASE_PLAN_LIMIT_GB=8` configured ✅
   - Warning at 80%, Critical at 90% ✅
   - Telegram alertlar test qiling

---

## 🔄 DEPLOYMENT CHECKLIST

### Pre-Deployment (Deploy qilishdan oldin)

- [ ] Supplier backend schema'ni sync qilish (KRITIK!)
- [ ] Production Supabase bucket yaratish
- [ ] Email provider configure qilish
- [ ] `.env.production` fayllarni tekshirish
- [ ] Database backup olish
- [ ] Health check endpointlar test qilish

### Deployment Process

```bash
# 1. Code'ni pull qilish
git pull origin main

# 2. Production images build qilish
./deploy-scripts/deploy.sh

# 3. VPS'ga SSH
ssh user@your-vps-ip

# 4. Image'larni pull qilish
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest
docker pull findbeauty/supplier-backend:latest
docker pull findbeauty/supplier-frontend:latest

# 5. Container'larni restart qilish
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# 6. Health check
curl http://localhost:3000/monitoring/health
curl http://localhost:3002/monitoring/health

# 7. Log'larni monitoring qilish
docker logs -f clinic-erp-backend-prod
docker logs -f supplier-erp-backend-prod
```

### Post-Deployment (Deploy qilgandan keyin)

- [ ] Barcha servislar running: `docker ps`
- [ ] Health checks passing
- [ ] Frontend'lar ochiladi
- [ ] Login ishlaydi
- [ ] Image upload test (product image)
- [ ] Order yaratish test
- [ ] Email yuborish test
- [ ] Telegram alert test
- [ ] Grafana dashboardlar configured

---

## 🧪 MANUAL TEST CHECKLIST (Production'da)

### Critical User Flows:

#### 1. Clinic Registration Flow
- [ ] Clinic register page ochiladi
- [ ] Certificate upload ishlaydi (OCR)
- [ ] Logo upload ishlaydi (Supabase)
- [ ] Member creation ishlaydi
- [ ] Terms of service checkbox required
- [ ] Email credentials yuboriladi

#### 2. Product Management
- [ ] Product create with image (Supabase'ga save)
- [ ] Product edit page ochiladi
- [ ] Image update ishlaydi
- [ ] Product delete ishlaydi
- [ ] CSV import ishlaydi

#### 3. Order Flow (KRITIK!)
- [ ] Order page ochiladi
- [ ] Product'lar ko'rinadi
- [ ] Price modal ishlaydi (cache fix test)
- [ ] Order yaratish ishlaydi (duplicate button fix test)
- [ ] Supplier'ga order notification boradi
- [ ] Supplier accept/reject qila oladi

#### 4. Inbound Flow
- [ ] Inbound pending page ochiladi
- [ ] Barcode scan modal ishlaydi
- [ ] Batch number auto-increment (001, 002)
- [ ] Expiry date parse (GS1 barcode)
- [ ] Manual lot entry ishlaydi
- [ ] Complete inbound ishlaydi

#### 5. Inventory
- [ ] Inventory dashboard ochiladi
- [ ] Stock counts to'g'ri
- [ ] Risky items (expiry warning) ko'rinadi
- [ ] White scrollbar ko'rinadi ✅

#### 6. Outbound
- [ ] Available products list
- [ ] Package creation ishlaydi
- [ ] Stock deduction to'g'ri

---

## 🐛 KNOWN BUGS (Kelajakda fix qilish kerak)

### Low Priority:

1. **Barcode Scan Modal State Loss**
   - Multiple scan qilganda modal yopilib ketishi mumkin
   - Temporary workaround: Har bir scan'dan keyin state saqlash

2. **Product Edit Page `updated_at` Not Updated**
   - Minor cosmetic issue
   - Backend'da automatic update bo'lishi kerak

3. **Frontend Cache Inconsistency**
   - Ba'zi joylarda refresh kerak
   - Cache invalidation strategiyasini yaxshilash kerak

4. **CSV Import Validation**
   - `has_expiry_period` validation qo'shilmagan
   - Future enhancement

---

## 📞 EMERGENCY CONTACTS

### Production Issues:

1. **Database Down:**
   - Supabase dashboard: https://supabase.com/dashboard
   - Check connection pooler status
   - Telegram alert'lar kelishi kerak

2. **Backend Crash:**
   ```bash
   docker logs clinic-erp-backend-prod --tail 100
   docker restart clinic-erp-backend-prod
   ```

3. **Storage Issues:**
   - Supabase Storage dashboard
   - Check bucket quota (8GB limit)
   - Fallback to local storage automatic

4. **Email Not Sending:**
   - Check Brevo dashboard
   - Verify API key
   - Check spam folder

---

## 🎯 PRIORITY ACTION PLAN

### Bugun (Deploy qilishdan oldin):

1. **YUQORI PRIORITET** 🔴
   - [ ] Supplier backend schema fix (30 min)
   - [ ] Production Supabase bucket setup (5 min)
   - [ ] Email provider configure (10 min)

2. **ORTA PRIORITET** 🟡
   - [ ] Manual test checklist bajaring (1 soat)
   - [ ] Database backup oling (5 min)
   - [ ] Monitoring test qiling (15 min)

3. **KELAJAK** 🟢
   - Cache invalidation strategiyasi
   - FIFO implementation
   - Known bugs fix

---

## ✅ FINAL DEPLOYMENT COMMAND

```bash
# 1. Barcha kritik muammolar hal qilindi
# 2. Manual test checklist passed
# 3. Database backup olindi

# Deploy!
./deploy-scripts/deploy.sh

# VPS'da
ssh user@your-vps-ip
cd /path/to/project
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

# Monitor
docker logs -f clinic-erp-backend-prod
```

---

## 📝 NOTES

- **Backup Strategy:** Supabase automatic daily backup (7 days retention)
- **Rollback Plan:** Previous Docker images tagged with date
- **Support:** Telegram bot real-time monitoring
- **Uptime Target:** 99.5% (expected downtime: 3.6 hours/month)

---

**REMEMBER:** Production'da debug mode o'chirilgan, barcha errorlar Telegram'ga keladi!

**OXIRGI CHECK:** Ushbu checklistdagi barcha 🔴 va 🟡 itemlar hal qilinganini tekshiring!
