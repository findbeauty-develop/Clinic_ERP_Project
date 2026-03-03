# 🚀 PRODUCTION DEPLOYMENT STEP-BY-STEP GUIDE

## Bugun userlar uchun deploy qilish - Bosqichma-bosqich qo'llanma

**Vaqt kerak:** ~2-3 soat (test bilan birga)  
**Oxirgi yangilanish:** 2026-03-03

---

## ⏱️ TIMELINE

| Bosqich                | Vaqt   | Muhimlik    |
| ---------------------- | ------ | ----------- |
| Pre-deployment fixes   | 45 min | 🔴 KRITIK   |
| Build & Push images    | 20 min | 🔴 KRITIK   |
| VPS deployment         | 15 min | 🔴 KRITIK   |
| Testing & verification | 45 min | 🟡 MUHIM    |
| Monitoring setup       | 30 min | 🟢 OPTIONAL |

---

## 📋 PHASE 1: PRE-DEPLOYMENT FIXES (45 min)

### Step 1.1: Supplier Backend Schema Fix (30 min)

**Problem:** OrderItem schema mismatch supplier-backend'da

```bash
# Local development'da
cd /Users/Development/Desktop/Clinic_ERP_Project

# 1. Schema faylni tekshiring
cat apps/supplier-backend/prisma/schema.prisma | grep -A 20 "model OrderItem"

# Agar "quantity" field borso, o'zgartirish kerak
```

**Option A: Schema faylni manual update qilish**

```bash
# apps/supplier-backend/prisma/schema.prisma ni ochish
code apps/supplier-backend/prisma/schema.prisma
```

`OrderItem` modelni quyidagicha o'zgartiring:

```prisma
model OrderItem {
  id                 String    @id @default(uuid())
  tenant_id          String
  order_id           String
  product_id         String
  batch_id           String?
  unit               String?

  // ✅ NEW: Clear quantity semantics
  ordered_quantity   Int       // Clinic order qilgan
  confirmed_quantity Int?      // Supplier tasdiqlagan
  inbound_quantity   Int?      // Clinic inbound qilgan
  pending_quantity   Int?      // Qolgan (confirmed - inbound)

  unit_price             Int
  confirmed_unit_price   Int?
  total_price            Int
  memo                   String?
  created_at         DateTime  @default(now())
  updated_at         DateTime?

  order   Order   @relation(fields: [order_id], references: [id], onDelete: Cascade)
  product Product @relation(fields: [product_id], references: [id])
  batch   Batch?  @relation(fields: [batch_id], references: [id])

  @@index([tenant_id])
  @@index([order_id])
  @@index([product_id])
  @@index([batch_id])
}
```

**Migration yaratish:**

```bash
cd apps/supplier-backend

# Development database'da migration yaratish
npx prisma migrate dev --name sync_order_item_schema

# Prisma client regenerate
npx prisma generate

# Test qilish
npm run dev  # Ishga tushishini tekshiring
```

**Option B: Direct SQL (VPS production'da)**

Agar schema faylni update qilmasdan to'g'ridan-to'g'ri production database'ni update qilmoqchi bo'lsangiz:

```sql
-- Supabase Dashboard > SQL Editor'da
-- SUPPLIER backend database'ni tanlang

-- 1. Eski column'ni o'chirish (agar mavjud bo'lsa)
ALTER TABLE "OrderItem" DROP COLUMN IF EXISTS "quantity";

-- 2. Yangi column'larni qo'shish
ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "ordered_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "confirmed_quantity" INTEGER,
  ADD COLUMN IF NOT EXISTS "inbound_quantity" INTEGER,
  ADD COLUMN IF NOT EXISTS "pending_quantity" INTEGER;

-- 3. Mavjud datani migrate qilish (agar kerak bo'lsa)
-- UPDATE "OrderItem" SET "ordered_quantity" = <old_value>;

-- 4. Index'larni yaratish
CREATE INDEX IF NOT EXISTS "OrderItem_tenant_id_idx" ON "OrderItem"("tenant_id");
CREATE INDEX IF NOT EXISTS "OrderItem_order_id_idx" ON "OrderItem"("order_id");
CREATE INDEX IF NOT EXISTS "OrderItem_product_id_idx" ON "OrderItem"("product_id");
```

**Verification:**

```bash
# Schema'ni tekshirish
npx prisma db pull  # Database'dan schemani pull qiladi
npx prisma format   # Format qiladi

# Git'ga commit qilish (agar o'zgarish bo'lsa)
git add apps/supplier-backend/prisma/
git commit -m "fix: sync OrderItem schema with clinic backend"
```

---

### Step 1.2: Production Supabase Bucket Setup (5 min)

```bash
# 1. .env.production faylini yarating (agar yo'q bo'lsa)
cp apps/backend/.env apps/backend/.env.production

# 2. Production Supabase credentials'ni kiriting
nano apps/backend/.env.production
```

Kerakli o'zgarishlar:

```env
NODE_ENV=production
SUPABASE_URL=https://ufktzxsegywvtclpwrvd.supabase.co  # Production URL
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Production service role key
```

```bash
# 3. Bucket yaratish
cd apps/backend
node scripts/create-supabase-bucket.js production

# Output:
# ✅ Bucket "clinic-uploads" created successfully!
```

**Verification:**

- Supabase Dashboard > Storage > Buckets
- `clinic-uploads` bucket ko'rinishi kerak
- Public: Yes
- File size limit: 10MB

---

### Step 1.3: Email Provider Setup (10 min)

```bash
# .env.production faylini ochish
nano apps/backend/.env.production
```

**Brevo'ni activate qilish:**

```env
# Comment'larni oching:

```

**Test qilish (optional):**

```bash
# Local'da test
cd apps/backend
npm run dev

# Postman yoki curl bilan test
curl -X POST http://localhost:3000/iam/members/send-credentials \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"memberId": "test-member-id"}'
```

---

## 📦 PHASE 2: BUILD & PUSH DOCKER IMAGES (20 min)

### Step 2.1: Git Commit & Push

```bash
# O'zgarishlarni commit qilish
git add .
git commit -m "chore: production readiness fixes - schema sync, supabase, email"
git push origin main
```

### Step 2.2: Docker Images Build

```bash
# Deploy script'ni ishga tushirish
cd /Users/Development/Desktop/Clinic_ERP_Project

# VPS IP'ni environment variable sifatida o'rnatish
export VPS_IP=your.vps.ip.address  # O'z VPS IP'ingizni kiriting

# Build va push
./deploy-scripts/deploy.sh
```

**Output:**

```
🚀 Starting deployment process...
📋 Configuration:
  VPS IP: xxx.xxx.xxx.xxx
  Backend URL: http://xxx.xxx.xxx.xxx:3000
  Supplier Backend URL: http://xxx.xxx.xxx.xxx:3002

📦 Building Clinic Backend...
[+] Building 145.2s (23/23) FINISHED
✅ Clinic Backend build va push qilindi

📦 Building Clinic Frontend...
[+] Building 178.5s (25/25) FINISHED
✅ Clinic Frontend build va push qilindi

📦 Building Supplier Backend...
[+] Building 142.8s (23/23) FINISHED
✅ Supplier Backend build va push qilindi

📦 Building Supplier Frontend...
[+] Building 165.3s (25/25) FINISHED
✅ Supplier Frontend build va push qilindi

🎉 Barcha image'lar muvaffaqiyatli build va push qilindi!
```

**Agar error chiqsa:**

```bash
# Docker Hub login qiling
docker login

# Buildx setup
docker buildx create --use --name multiarch-builder
docker buildx inspect --bootstrap

# Retry
./deploy-scripts/deploy.sh
```

---

## 🖥️ PHASE 3: VPS DEPLOYMENT (15 min)

### Step 3.1: VPS'ga SSH

```bash
ssh your-user@your-vps-ip
# Password yoki SSH key bilan kirish
```

### Step 3.2: Project Directory Setup

```bash
# Project directory'ga o'tish
cd /path/to/your/clinic-erp-project

# Yoki yangi setup qilish:
mkdir -p ~/clinic-erp
cd ~/clinic-erp
```

### Step 3.3: Environment Files Prepare

```bash
# Local'dan VPS'ga .env fayllarni ko'chirish
# LOCAL TERMINAL'DA (yangi tab ochib):

# Clinic backend
scp /Users/Development/Desktop/Clinic_ERP_Project/apps/backend/.env.production \
    your-user@your-vps-ip:~/clinic-erp/apps/backend/.env

# Supplier backend
scp /Users/Development/Desktop/Clinic_ERP_Project/apps/supplier-backend/.env \
    your-user@your-vps-ip:~/clinic-erp/apps/supplier-backend/.env

# Google Cloud credentials
scp -r /Users/Development/Desktop/Clinic_ERP_Project/apps/backend/keys \
    your-user@your-vps-ip:~/clinic-erp/apps/backend/
```

### Step 3.4: Docker Compose Setup

```bash
# VPS TERMINAL'DA:

# docker-compose.prod.yml faylini ko'chirish
scp /Users/Development/Desktop/Clinic_ERP_Project/docker-compose.prod.yml \
    your-user@your-vps-ip:~/clinic-erp/

# Prometheus config
scp -r /Users/Development/Desktop/Clinic_ERP_Project/prometheus \
    your-user@your-vps-ip:~/clinic-erp/
```

### Step 3.5: Pull Images & Start

```bash
# VPS'da
cd ~/clinic-erp

# Images pull
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest
docker pull findbeauty/supplier-backend:latest
docker pull findbeauty/supplier-frontend:latest

# Eski container'larni to'xtatish
docker-compose -f docker-compose.prod.yml down

# Yangi container'larni start qilish
docker-compose -f docker-compose.prod.yml up -d

# Status tekshirish
docker ps

# Expected output:
# CONTAINER ID   IMAGE                                  STATUS         PORTS
# xxxxxxxxxxxx   findbeauty/clinic-backend:latest      Up 10 seconds  0.0.0.0:3000->3000/tcp
# xxxxxxxxxxxx   findbeauty/clinic-frontend:latest     Up 10 seconds  0.0.0.0:3001->3001/tcp
# xxxxxxxxxxxx   findbeauty/supplier-backend:latest    Up 10 seconds  0.0.0.0:3002->3002/tcp
# xxxxxxxxxxxx   findbeauty/supplier-frontend:latest   Up 10 seconds  0.0.0.0:3003->3003/tcp
```

---

## ✅ PHASE 4: TESTING & VERIFICATION (45 min)

### Step 4.1: Health Checks (5 min)

```bash
# VPS'da

# Backend health
curl http://localhost:3000/monitoring/health
# Expected: {"status":"ok","timestamp":"..."}

curl http://localhost:3002/monitoring/health
# Expected: {"status":"ok","timestamp":"..."}

# Frontend
curl -I http://localhost:3001
# Expected: HTTP/1.1 200 OK

curl -I http://localhost:3003
# Expected: HTTP/1.1 200 OK
```

### Step 4.2: Log Monitoring (10 min)

```bash
# Real-time log'larni ko'rish
docker logs -f clinic-erp-backend-prod

# Qidirilayotgan log'lar:
# ✅ Supabase Storage initialized
# ✅ Nest application successfully started
# ✅ Clinic Backend server is running on port 3000

# Supplier backend
docker logs -f supplier-erp-backend-prod

# Agar error ko'rsatsa:
docker logs clinic-erp-backend-prod --tail 100 > backend-errors.log
```

### Step 4.3: Frontend Access (5 min)

**Browser'da ochish:**

1. **Clinic Frontend:** `http://your-vps-ip:3001`
2. **Supplier Frontend:** `http://your-vps-ip:3003`

**Domain orqali (agar Nginx configured bo'lsa):**

1. `https://clinic.jaclit.com`
2. `https://supplier.jaclit.com`

### Step 4.4: Critical Flow Testing (25 min)

#### Test 1: Login (5 min)

```bash
# Browser'da:
1. Go to: http://your-vps-ip:3001
2. Login: existing user credentials
3. Verify: dashboard loads
4. Check: sidebar logo visible (Supabase test)
```

#### Test 2: Product Image Upload (10 min)

```bash
# Browser'da:
1. Go to: /inbound/new
2. Create new product with image
3. Submit
4. Verify:
   - Image visible in product list
   - Image URL: https://ufktzxsegywvtclpwrvd.supabase.co/...
   - Not: /uploads/... (local)

# Backend log'da tekshirish:
docker logs clinic-erp-backend-prod | grep "File uploaded"
# Expected: ✅ File uploaded: product/tenant_id/timestamp-random.jpg
```

#### Test 3: Order Creation (10 min)

```bash
# Browser'da:
1. Go to: /order
2. Add products to cart
3. Click "주문서 생성" (Create Order)
4. Verify:
   - No duplicate orders (button disabled during creation)
   - Order created successfully
   - Supplier receives notification (check supplier-backend log)

# Supplier backend log:
docker logs supplier-erp-backend-prod | grep "Order created"
```

---

## 🔍 PHASE 5: MONITORING SETUP (30 min - Optional)

### Step 5.1: Prometheus Setup (10 min)

```bash
# Browser'da:
http://your-vps-ip:9090

# Targets tekshirish:
http://your-vps-ip:9090/targets

# Expected: All targets "UP"
```

### Step 5.2: Grafana Setup (15 min)

```bash
# Browser'da:
http://your-vps-ip:3004

# Login:
Username: admin
Password: (check .env GRAFANA_ADMIN_PASSWORD)

# Dashboard import:
1. Sidebar > Dashboards > Import
2. Upload JSON from: /Users/Development/Desktop/Clinic_ERP_Project/grafana-dashboards/
   (if exists)
3. Or create manually
```

### Step 5.3: Telegram Alerts Test (5 min)

```bash
# VPS'da:
curl -X POST http://localhost:3000/monitoring/test-notification

# Telegram'da notification kelishi kerak:
# 🧪 Test Notification
# This is a test message from Clinic ERP monitoring system.
```

---

## 🎯 PHASE 6: FINAL CHECKLIST

### Before Going Live:

- [ ] ✅ All 4 containers running (`docker ps`)
- [ ] ✅ Health checks passing
- [ ] ✅ Login works
- [ ] ✅ Product image upload → Supabase
- [ ] ✅ Order creation works (no duplicates)
- [ ] ✅ Supplier notification received
- [ ] ✅ Email sending works (test member creation)
- [ ] ✅ Telegram alerts working
- [ ] ✅ Grafana accessible
- [ ] ✅ Database backup created

### Announcement:

```bash
# Telegram/Slack'da:
🚀 Production Deployment COMPLETE!

✅ Clinic ERP is now LIVE!

📍 URLs:
  - Clinic: https://clinic.jaclit.com
  - Supplier: https://supplier.jaclit.com
  - Monitoring: http://xxx.xxx.xxx.xxx:3004

⏰ Deployed: 2026-03-03 HH:MM
👥 Team: Ready for users!
📊 Status: All systems operational
```

---

## 🚨 ROLLBACK PLAN (If Needed)

Agar deploy qilingandan keyin critical issue chiqsa:

```bash
# VPS'da

# 1. Stop current containers
docker-compose -f docker-compose.prod.yml down

# 2. Pull previous version (if tagged)
docker pull findbeauty/clinic-backend:previous
docker pull findbeauty/clinic-frontend:previous
docker pull findbeauty/supplier-backend:previous
docker pull findbeauty/supplier-frontend:previous

# 3. Update docker-compose.prod.yml
nano docker-compose.prod.yml
# Change image tags to :previous

# 4. Start with old version
docker-compose -f docker-compose.prod.yml up -d

# 5. Verify
./health-check.sh
```

---

## 📞 POST-DEPLOYMENT SUPPORT

### Monitoring Commands:

```bash
# Real-time monitoring (tmux recommended)
tmux new -s monitoring

# Window 1: Backend logs
docker logs -f clinic-erp-backend-prod

# Window 2: Supplier logs
docker logs -f supplier-erp-backend-prod

# Window 3: System resources
htop
```

### User Support:

1. **Telegram Group:** Real-time alerts keladi
2. **Log Files:** `/var/log/clinic-erp/` (if configured)
3. **Grafana Dashboard:** Real-time metrics
4. **Supabase Dashboard:** Database monitoring

---

## ✅ DEPLOYMENT COMPLETE!

**Keyingi qadamlar:**

1. User training/onboarding
2. Monitor logs for 24-48 hours
3. Collect user feedback
4. Performance optimization (if needed)
5. Feature enhancements

**Documentation:**

- Main guide: `PRODUCTION_READINESS_CHECKLIST.md`
- Quick fixes: `QUICK_FIX_GUIDE.md`
- This guide: `DEPLOYMENT_STEP_BY_STEP.md`

---

**REMEMBER:** Production'da barcha o'zgarishlar Telegram'ga alert yuboradi. Monitor qilib turing! 📱
