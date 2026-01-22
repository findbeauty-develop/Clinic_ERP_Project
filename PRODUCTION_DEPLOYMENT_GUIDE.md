# 🚀 Production Deployment Guide - Clinic ERP

**Toza va xatosiz production deployment qo'llanmasi**

---

## 📋 Mundarija

1. [Supabase Production Database](#1-supabase-production-database)
2. [Environment Variables](#2-environment-variables)
3. [Docker Images Build](#3-docker-images-build)
4. [VPS Deployment](#4-vps-deployment)
5. [Verification & Testing](#5-verification--testing)
6. [Troubleshooting](#6-troubleshooting)

---

## 1️⃣ Supabase Production Database

### 1.1 Yangi Production Database Yaratish

1. **Supabase'ga kiring:** https://supabase.com
2. **Yangi project yarating:**
   - "New Project" tugmasini bosing
   - **Name:** `clinic-erp-production`
   - **Database Password:** Kuchli parol yarating (masalan: `Prod@2025!Clinic`)
   - **Region:** `Northeast Asia (Seoul)` (yoki eng yaqin region)
   - **Pricing Plan:** Pro yoki Free (kerakka qarab)
3. **Connection String'larni oling:**
   - Project Settings → Database → Connection String
   - **Connection Pooling URI** (Port 6543) - PgBouncer bilan:
     ```
     postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
     ```
   - **Direct Connection URI** (Port 5432) - To'g'ridan-to'g'ri:
     ```
     postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
     ```

### 1.2 Schema Migration (Prisma bilan)

**Local'dan bajaring:**

```bash
# 1. Project directory'ga o'ting
cd /Users/Development/Desktop/Clinic_ERP_Project

# 2. Backend directory'ga o'ting
cd apps/backend

# 3. Production DATABASE_URL'ni export qiling
export DATABASE_URL="postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?pgbouncer=true"

export DIRECT_URL="postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"

# 4. Prisma migration'larni deploy qiling
npx prisma migrate deploy

# 5. Prisma Client'ni regenerate qiling
npx prisma generate
```

**✅ Success ko'rsatkichlari:**

```
✔ Generated Prisma Client (x.x.x) to ./node_modules/.prisma/client-backend in xxms
Applied 6 migrations:
  - 20251206065009_init
  - 20251215150000_add_warehouse_location
  - 20251215160000_add_clinic_privacy_settings
  - 20251217000000_add_memo_to_clinic_supplier_link
  - 20251218105350_add_supplier_models
  - 20251218143856_add_supplier_manager_id_to_supplier_product
```

### 1.3 Supplier Backend Prisma Client Generate

**⚠️ Muhim:** Clinic va Supplier backend'lar **bir xil database**ni ishlatadilar. Supplier-related table'lar clinic-backend migration'larida allaqachon yaratilgan. Shuning uchun supplier-backend uchun **faqat Prisma Client generate** qilamiz (migration deploy emas).

```bash
# 1. Supplier backend directory'ga o'ting
cd /Users/Development/Desktop/Clinic_ERP_Project/apps/supplier-backend

# 2. Production DATABASE_URL'ni export qiling (clinic bilan bir xil)
export DATABASE_URL="postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?pgbouncer=true"

export DIRECT_URL="postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"

# 3. Prisma Client'ni generate qiling (migration emas!)
npx prisma generate
```

**✅ Success ko'rsatkichlari:**

```
✔ Generated Prisma Client (x.x.x) to ./node_modules/.prisma/client-supplier in xxms
```

**❓ Qachon migration deploy qilish kerak?**

Agar clinic-backend migration'lari supplier table'larini yaratmagan bo'lsa (masalan, development'da alohida database ishlatilgan bo'lsa):

```bash
# Faqat kerak bo'lganda!
cd /Users/Development/Desktop/Clinic_ERP_Project/apps/supplier-backend

export DATABASE_URL="postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?pgbouncer=true"

npx prisma migrate deploy
npx prisma generate
```

---

## 2️⃣ Environment Variables

### 2.1 Clinic Backend `.env`

**File:** `apps/backend/.env`

```bash
# Database (Production Supabase)
DATABASE_URL=postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres

# JWT
JWT_SECRET=your_super_secure_jwt_secret_production_2025

# Clinic Backend URL (VPS IP)
CLINIC_BACKEND_URL=http://72.60.108.46:3000

# Supplier Backend Connection
SUPPLIER_BACKEND_URL=http://72.60.108.46:3002
SUPPLIER_BACKEND_API_KEY=your_secret_api_key_here_34534sdffsd69ds8f8e9sdf89sd4e9e8w9f

# Google Cloud Vision API (OCR)
GOOGLE_APPLICATION_CREDENTIALS=./keys/clinic-ocr-prod-aeccdd231e2e.json

# Solapi SMS
SOLAPI_API_KEY=your_solapi_api_key
SOLAPI_API_SECRET=your_solapi_api_secret
SOLAPI_SENDER_PHONE=01012345678

# HIRA API (Health Insurance Review & Assessment)
HIRA_API_KEY=your_hira_api_key
HIRA_API_SECRET=your_hira_api_secret
```

### 2.2 Clinic Frontend `.env.local`

**File:** `apps/frontend/.env.local`

```bash
# API URL (runtime'da dinamik aniqlanadi, bu faqat fallback)
NEXT_PUBLIC_API_URL=http://72.60.108.46:3000
```

**⚠️ Muhim:** Frontend'da `NEXT_PUBLIC_API_URL` runtime'da dinamik aniqlanadi (`lib/api.ts`), shuning uchun bu faqat fallback.

### 2.3 Supplier Backend `.env`

**File:** `apps/supplier-backend/.env`

```bash
# Database (Production Supabase - bir xil yoki alohida)
DATABASE_URL=postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres

# JWT
JWT_SECRET=your_super_secure_jwt_secret_production_2025

# Supplier Backend URL
SUPPLIER_BACKEND_URL=http://72.60.108.46:3002

# Clinic Backend Connection
CLINIC_BACKEND_URL=http://72.60.108.46:3000
SUPPLIER_BACKEND_API_KEY=your_secret_api_key_here_34534sdffsd69ds8f8e9sdf89sd4e9e8w9f

# Solapi SMS
SOLAPI_API_KEY=your_solapi_api_key
SOLAPI_API_SECRET=your_solapi_api_secret
SOLAPI_SENDER_PHONE=01012345678
```

### 2.4 Supplier Frontend `.env.local`

**File:** `apps/supplier-frontend/.env.local`

```bash
# API URL
NEXT_PUBLIC_API_URL=http://72.60.108.46:3002
```

---

## 3️⃣ Docker Images Build

### 3.1 Multi-platform Build Setup (Mac M1/M2 uchun)

#Deploy shellni ishga tushurish
./deploy-production.sh

```bash
# 1. Project root directory'ga o'ting
cd /Users/Development/Desktop/Clinic_ERP_Project

# 2. Buildx builder yarating (birinchi marta)
docker buildx create --name multiarch-builder --use
docker buildx inspect --bootstrap
```

### 3.2 Clinic Backend Build

```bash
# 1. Backend image build va push
docker buildx build \
  --platform linux/amd64 \
  -f apps/backend/Dockerfile \
  -t findbeauty/clinic-backend:latest \
  --push \
  .

# ✅ Success: Image pushed to Docker Hub
```

### 3.3 Clinic Frontend Build

```bash
# 1. Frontend image build va push (API URL bilan)
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 \
  -f apps/frontend/Dockerfile \
  -t findbeauty/clinic-frontend:latest \
  --push \
  .

# ✅ Success: Image pushed to Docker Hub
```

### 3.4 Supplier Backend Build (ixtiyoriy)

```bash
# Agar supplier-backend o'zgargan bo'lsa
docker buildx build \
  --platform linux/amd64 \
  -f apps/supplier-backend/Dockerfile \
  -t findbeauty/supplier-backend:latest \
  --push \
  .
```

### 3.5 Supplier Frontend Build (ixtiyoriy)

```bash
# Agar supplier-frontend o'zgargan bo'lsa
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=http://72.60.108.46:3002 \
  -f apps/supplier-frontend/Dockerfile \
  -t findbeauty/supplier-frontend:latest \
  --push \
  .
```

---

## 4️⃣ VPS Deployment

### 4.1 VPS'ga Environment Files Upload

**Local terminal'dan (Mac):**

```bash
# 1. Backend .env
scp /Users/Development/Desktop/Clinic_ERP_Project/apps/backend/.env \
  root@72.60.108.46:~/clinic-erp/apps/backend/.env

# 2. Frontend .env.local
scp /Users/Development/Desktop/Clinic_ERP_Project/apps/frontend/.env.local \
  root@72.60.108.46:~/clinic-erp/apps/frontend/.env.local

# 3. Supplier Backend .env (agar o'zgargan bo'lsa)
scp /Users/Development/Desktop/Clinic_ERP_Project/apps/supplier-backend/.env \
  root@72.60.108.46:~/clinic-erp/apps/supplier-backend/.env

# 4. Supplier Frontend .env.local (agar o'zgargan bo'lsa)
scp /Users/Development/Desktop/Clinic_ERP_Project/apps/supplier-frontend/.env.local \
  root@72.60.108.46:~/clinic-erp/apps/supplier-frontend/.env.local

# 5. Docker Compose file
scp /Users/Development/Desktop/Clinic_ERP_Project/docker-compose.prod.yml \
  root@72.60.108.46:~/clinic-erp/docker-compose.prod.yml
```

### 4.2 Google Cloud Vision Key Upload (agar backend OCR ishlatilsa)

```bash
# 1. Key directory yaratish
ssh root@72.60.108.46 "mkdir -p ~/clinic-erp/apps/backend/keys"

# 2. Key file upload
scp /Users/Development/Desktop/Clinic_ERP_Project/apps/backend/keys/clinic-ocr-prod-aeccdd231e2e.json \
  root@72.60.108.46:~/clinic-erp/apps/backend/keys/clinic-ocr-prod-aeccdd231e2e.json
```

### 4.3 VPS'da Deployment

**VPS terminal (SSH qiling: `ssh root@72.60.108.46`):**

```bash
# 1. Project directory'ga o'ting
cd ~/clinic-erp

# 2. Yangi image'larni pull qiling
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest
docker pull findbeauty/supplier-backend:latest
docker pull findbeauty/supplier-frontend:latest

# 3. Eski container'larni to'xtatib o'chiring
docker compose -f docker-compose.prod.yml down

# 4. Yangi image'lar bilan container'larni ishga tushiring
docker compose -f docker-compose.prod.yml up -d

# 5. Container'lar ishlayotganini tekshiring
docker ps
```

**✅ Expected output:**

```
CONTAINER ID   IMAGE                                  STATUS        PORTS
abc123...      findbeauty/clinic-frontend:latest      Up 5 seconds  0.0.0.0:3001->3001/tcp
def456...      findbeauty/clinic-backend:latest       Up 5 seconds  0.0.0.0:3000->3000/tcp
ghi789...      findbeauty/supplier-frontend:latest    Up 5 seconds  0.0.0.0:3003->3003/tcp
jkl012...      findbeauty/supplier-backend:latest     Up 5 seconds  0.0.0.0:3002->3002/tcp
```

---

## 5️⃣ Verification & Testing

### 5.1 Backend Health Check

```bash
# VPS'da yoki local'dan
curl http://72.60.108.46:3000/docs
# Expected: Swagger UI HTML yoki 200 OK

curl http://72.60.108.46:3002/docs
# Expected: Supplier Swagger UI HTML yoki 200 OK
```

### 5.2 Frontend Access

**Browser'da ochish:**

1. **Clinic Frontend:** http://72.60.108.46:3001
2. **Supplier Frontend:** http://72.60.108.46:3003

### 5.3 Container Logs Tekshirish

```bash
# VPS'da

# Clinic Backend logs
docker logs -f clinic-erp-backend-prod

# Expected success logs:
# [Nest] INFO [PrismaService] 🔌 Database connection: Direct (port 5432)
# [Nest] INFO [NestApplication] Nest application successfully started

# Clinic Frontend logs
docker logs -f clinic-erp-frontend-prod

# Supplier Backend logs
docker logs -f supplier-erp-backend-prod

# Supplier Frontend logs
docker logs -f supplier-erp-frontend-prod
```

### 5.4 Database Connection Test

```bash
# VPS'da - backend container ichiga kiring
docker exec -it clinic-erp-backend-prod sh

# Prisma Studio ishga tushiring (ixtiyoriy)
npx prisma studio --port 5555

# Exit
exit
```

### 5.5 Full Application Test

1. **Login Test:**

   - http://72.60.108.46:3001/login
   - Credentials: `test` / `password` (yoki sizning test user'ingiz)

2. **Order Flow Test:**

   - Yangi order yarating
   - Cart'ga mahsulot qo'shing
   - Supplier'ga yuboring
   - Supplier frontend'da tekshiring: http://72.60.108.46:3003

3. **Inbound Test:**

   - Yangi mahsulot qo'shing
   - Batch yarating
   - Stock'ni tekshiring

4. **Return Flow Test:**
   - Outbound yarating
   - Return qiling
   - Supplier frontend'da return request tekshiring

---

## 6️⃣ Troubleshooting

### ❌ Error: `API base URL is not configured`

**Sabab:** Frontend'da `NEXT_PUBLIC_API_URL` build vaqtida to'g'ri o'rnatilmagan.

**Yechim:**

```bash
# 1. Frontend'ni qayta build qiling (Local'da)
cd /Users/Development/Desktop/Clinic_ERP_Project

docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 \
  -f apps/frontend/Dockerfile \
  -t findbeauty/clinic-frontend:latest \
  --push \
  .

# 2. VPS'da yengi image pull qiling
ssh root@72.60.108.46
cd ~/clinic-erp
docker pull findbeauty/clinic-frontend:latest
docker compose -f docker-compose.prod.yml restart frontend
```

### ❌ Error: `Cannot connect to supplier-backend`

**Sabab:** Container'lar bir-biriga ulanolmayapti.

**Yechim:**

1. `docker-compose.prod.yml` da `SUPPLIER_BACKEND_URL` to'g'ri ekanligini tekshiring:

```yaml
services:
  backend:
    environment:
      - SUPPLIER_BACKEND_URL=http://72.60.108.46:3002 # ✅ VPS IP
```

2. Container'larni restart qiling:

```bash
docker compose -f docker-compose.prod.yml restart backend
```

### ❌ Error: `prepared statement "s32" does not exist`

**Sabab:** PgBouncer transaction mode prepared statement'larni qo'llab-quvvatlamaydi.

**Yechim:** `DATABASE_URL` da `?pgbouncer=true` borligini tekshiring:

```bash
# apps/backend/.env
DATABASE_URL=postgresql://...?pgbouncer=true
```

### ❌ Error: `Google Cloud Vision credentials file not found`

**Sabab:** `keys/` directory Docker container'ga mount qilinmagan.

**Yechim:**

1. Key file'ni VPS'ga upload qiling (4.2-qadam)
2. `docker-compose.prod.yml` da `volumes` mount qiling:

```yaml
services:
  backend:
    volumes:
      - ./apps/backend/keys:/app/apps/backend/keys:ro
    environment:
      - GOOGLE_APPLICATION_CREDENTIALS=./keys/clinic-ocr-prod-aeccdd231e2e.json
```

3. Container'ni restart qiling:

```bash
docker compose -f docker-compose.prod.yml restart backend
```

### ❌ Error: `Conflict. The container name is already in use`

**Sabab:** Eski container hali running yoki stopped holatda.

**Yechim:**

```bash
# 1. Barcha container'larni to'xtatib o'chirish
docker compose -f docker-compose.prod.yml down

# 2. Agar ishlamasa, force delete
docker rm -f clinic-erp-frontend-prod clinic-erp-backend-prod

# 3. Qayta ishga tushirish
docker compose -f docker-compose.prod.yml up -d
```

### ❌ Error: `Order quantity sent to supplier is excessive`

**Sabab:** Frontend PUT → 404 → POST fallback ishlaganda quantity qo'shiladi.

**Yechim:** ✅ **Allaqachon fix qilindi** (2025-12-20). Backend'da `addDraftItem` quantity to'g'ridan-to'g'ri o'rnatiladi:

```typescript
// OLD (xato)
newQty = oldQty + dto.quantity;

// NEW (to'g'ri) ✅
newQty = dto.quantity;
```

### 🔍 Container Ichini Tekshirish

```bash
# Backend container ichiga kirish
docker exec -it clinic-erp-backend-prod sh

# Environment variable'larni ko'rish
printenv | grep -E "DATABASE_URL|SUPPLIER_BACKEND"

# Exit
exit
```

---

## 📦 Complete Deployment Checklist

### Pre-Deployment

- [ ] Supabase production database yaratildi
- [ ] `DATABASE_URL` va `DIRECT_URL` olindi
- [ ] Clinic backend Prisma migrations deploy qilindi
- [ ] Supplier backend Prisma Client generate qilindi (migration emas!)
- [ ] Environment files to'ldirildi (`.env`, `.env.local`)
- [ ] Google Cloud Vision key file mavjud

### Build & Push

- [ ] `clinic-backend:latest` built and pushed
- [ ] `clinic-frontend:latest` built and pushed (with `--build-arg NEXT_PUBLIC_API_URL`)
- [ ] `supplier-backend:latest` built and pushed
- [ ] `supplier-frontend:latest` built and pushed

### VPS Deployment

- [ ] Environment files VPS'ga upload qilindi
- [ ] Google Cloud Vision key VPS'ga upload qilindi
- [ ] `docker-compose.prod.yml` VPS'ga upload qilindi
- [ ] Docker images pull qilindi
- [ ] Container'lar ishga tushirildi (`docker compose up -d`)
- [ ] Container'lar running (`docker ps`)

### Verification

- [ ] Backend health check OK (`/docs`)
- [ ] Frontend accessible (browser)
- [ ] Login ishlayapti
- [ ] Order flow ishlayapti (clinic → supplier)
- [ ] Return flow ishlayapti (clinic → supplier)
- [ ] Database connection success (logs)
- [ ] No errors in logs

---

## 🎉 Success!

Agar barcha checklist ✅ bo'lsa, production deployment muvaffaqiyatli yakunlandi!

**Production URLs:**

- 🏥 **Clinic Frontend:** http://72.60.108.46:3001
- 🔧 **Clinic Backend API:** http://72.60.108.46:3000/docs
- 🏭 **Supplier Frontend:** http://72.60.108.46:3003
- 🔧 **Supplier Backend API:** http://72.60.108.46:3002/docs

---

## 📞 Support

Agar muammolar bo'lsa, quyidagi ma'lumotlarni yuboring:

1. **Backend logs:**

   ```bash
   docker logs clinic-erp-backend-prod | tail -100
   ```

2. **Frontend browser console errors** (F12 → Console)

3. **Environment file check:**
   ```bash
   docker exec -it clinic-erp-backend-prod sh -c "printenv | grep -E 'DATABASE_URL|SUPPLIER_BACKEND_URL'"
   ```

---

**Last Updated:** 2025-12-20
**Version:** 2.0.0
**Author:** Clinic ERP Development Team
