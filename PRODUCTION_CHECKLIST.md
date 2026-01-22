# 🚀 Production Deployment Checklist

Bu checklist production'ga chiqishdan oldin va keyin development'ni davom ettirish uchun kerakli barcha qadamlarni o'z ichiga oladi.

---

## 📋 Production'ga Chiqishdan Oldin (MAJBURIY)

### ✅ 1. CORS Production Safety
- [x] Production'da localhost fallback'ni o'chirish
- [x] CORS_ORIGINS bo'sh bo'lsa error throw qilish
- [x] Origin validation callback function
- [x] Preflight request handling

**Status:** ✅ Implement qilingan (`apps/backend/src/main.ts`, `apps/supplier-backend/src/main.ts`)

### ✅ 2. Swagger Security
- [x] Production'da Swagger butunlay o'chirish
- [x] Development'da Swagger ishlaydi

**Status:** ✅ Implement qilingan

### ✅ 3. Environment Variables
- [ ] Production `.env.production` fayllarini yaratish
- [ ] `CORS_ORIGINS` to'ldirish (majburiy!)
- [ ] `NODE_ENV=production` sozlash
- [ ] Barcha secret key'larni to'ldirish

**Template fayllar:**
- `apps/backend/.env.production.example` ✅
- `apps/frontend/.env.production.example` ✅
- `apps/supplier-backend/.env.production.example` ✅

**Qanday qilish:**
```bash
# Backend
cd apps/backend
cp .env.production.example .env.production
# .env.production'ni tahrirlang va to'ldiring

# Frontend
cd apps/frontend
cp .env.production.example .env.production
# .env.production'ni tahrirlang va to'ldiring

# Supplier Backend
cd apps/supplier-backend
cp .env.production.example .env.production
# .env.production'ni tahrirlang va to'ldiring
```

### ✅ 4. Database Migration
- [ ] Production database yaratish (Supabase)
- [ ] Production `DATABASE_URL` export qilish
- [ ] Migration deploy qilish
- [ ] Prisma Client generate qilish

**Commands:**
```bash
# Production DATABASE_URL export qiling
export DATABASE_URL="postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
export DIRECT_URL="postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"

# Migration deploy qiling
cd apps/backend
npx prisma migrate deploy
npx prisma generate

# Supplier backend uchun ham
cd apps/supplier-backend
npx prisma migrate deploy
npx prisma generate
```

### ✅ 5. Build & Test
- [ ] Backend build test qilish
- [ ] Frontend build test qilish
- [ ] Docker image build test qilish

**Commands:**
```bash
# Backend build
cd apps/backend
npm run build

# Frontend build
cd apps/frontend
npm run build

# Docker build (test)
docker-compose -f docker-compose.prod.yml build
```

### ✅ 6. Security Checklist
- [x] Token Storage Security (HttpOnly Cookie)
- [x] Rate Limiting
- [x] Error Handling & Logging
- [x] Swagger Security
- [x] CORS Production Safety
- [ ] XSS Protection (keyinchalik)
- [ ] CSRF Protection (keyinchalik)
- [ ] Server Security (Firewall) (production'da)
- [ ] Nginx Reverse Proxy & SSL (production'da)
- [ ] Supabase RLS (production'da)

**Batafsil:** `PROJECT_SECURITY_TODO_LIST.md` faylini ko'ring

---

## 🔄 Production'ga Chiqishdan Keyin Development'ni Davom Ettirish

### 1. Git Branch Strategy

**Tavsiya etilgan workflow:**
```bash
# Production branch yaratish (bir marta)
git checkout -b production
git push origin production

# Development'da ishlash (asosiy branch)
git checkout main  # yoki master
# Development'da o'zgarishlar qilish
git add .
git commit -m "feat: new feature"
git push origin main

# Production'ga chiqish uchun
git checkout production
git merge main  # yoki cherry-pick specific commits
git push origin production
```

### 2. Environment Variables Separation

**Development:**
- `apps/backend/.env` - Development
- `apps/frontend/.env.local` - Development
- `apps/supplier-backend/.env` - Development

**Production (server'da):**
- `apps/backend/.env.production` - Production
- `apps/frontend/.env.production` - Production
- `apps/supplier-backend/.env.production` - Production

**⚠️ Muhim:** `.env.production` fayllarini `.gitignore`'da saqlash kerak!

### 3. Code Changes

**Development'da:**
- Normal development workflow
- `NODE_ENV` environment variable orqali ajratiladi
- Production'ga ta'sir qilmaydi

**Conditional Code Examples:**
```typescript
// Swagger (faqat development'da)
const isProduction = process.env.NODE_ENV === "production";
if (!isProduction) {
  // Swagger setup
}

// CORS (production'da strict)
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : isProduction
  ? (() => { throw new Error("CORS_ORIGINS required"); })()
  : ["http://localhost:3001"];
```

---

## 🔄 Development'dan Production'ga Qayta Chiqish

### 1. Pre-deployment Checklist

```bash
# 1. CORS Production Safety tekshirish
grep -r "CORS_ORIGINS" apps/backend/src/main.ts
grep -r "CORS_ORIGINS" apps/supplier-backend/src/main.ts

# 2. Environment variables tekshirish
cat apps/backend/.env.production | grep CORS_ORIGINS
cat apps/frontend/.env.production | grep NEXT_PUBLIC_API_URL

# 3. Database migration tekshirish
cd apps/backend
npx prisma migrate status

# 4. Build test qilish
npm run build

# 5. Security checklist tekshirish
cat PROJECT_SECURITY_TODO_LIST.md
```

### 2. Deployment Process

```bash
# 1. Git'dan production branch'ni pull qiling
git checkout production
git pull origin production

# 2. Environment variables'ni yangilang
# .env.production fayllarini tahrirlang

# 3. Database migration qiling
export DATABASE_URL="postgresql://..."
cd apps/backend
npx prisma migrate deploy
npx prisma generate

# 4. Docker image'larni build qiling
docker-compose -f docker-compose.prod.yml build

# 5. Deploy qiling
docker-compose -f docker-compose.prod.yml up -d

# 6. Log'larni tekshirish
docker-compose -f docker-compose.prod.yml logs -f
```

### 3. Post-deployment Verification

```bash
# 1. Health check
curl https://your-domain.com/health

# 2. API test
curl https://api.your-domain.com/products \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. CORS test
curl -X OPTIONS https://api.your-domain.com/member/login \
  -H "Origin: https://your-domain.com" \
  -v

# 4. Swagger test (production'da o'chirilgan bo'lishi kerak)
curl https://api.your-domain.com/docs
# 404 yoki error qaytishi kerak

# 5. Log'lar tekshirish
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs frontend
```

---

## ⚠️ Muammolarni Oldini Olish

### 1. Environment Variable Conflicts

**Muammo:** Development va Production .env conflict

**Yechim:**
- `.env` - Development
- `.env.production` - Production
- `.gitignore`'da `.env*` borligini tekshirish

**Tekshirish:**
```bash
grep -r "\.env" .gitignore
```

### 2. Database Migration Conflicts

**Muammo:** Development va Production database migration conflict

**Yechim:**
- Production'da `prisma migrate deploy` ishlatish
- Development'da `prisma migrate dev` ishlatish
- Migration fayllarni Git'da saqlash

**Tekshirish:**
```bash
# Development'da
cd apps/backend
npx prisma migrate status

# Production'da
export DATABASE_URL="postgresql://..."
npx prisma migrate status
```

### 3. Code Conflicts

**Muammo:** Development va Production code conflict

**Yechim:**
- `NODE_ENV` environment variable orqali ajratish
- Conditional code (Swagger, CORS, va h.k.)

**Tekshirish:**
```bash
# Production'da NODE_ENV tekshirish
echo $NODE_ENV  # "production" bo'lishi kerak

# Development'da
echo $NODE_ENV  # undefined yoki "development" bo'lishi kerak
```

### 4. CORS Errors

**Muammo:** Production'da CORS error

**Yechim:**
- `CORS_ORIGINS` environment variable to'ldirish
- Origin validation callback function

**Tekshirish:**
```bash
# .env.production'da
cat apps/backend/.env.production | grep CORS_ORIGINS

# Backend log'larida
docker-compose -f docker-compose.prod.yml logs backend | grep CORS
```

---

## 📚 Foydali Resurslar

- **Security Checklist:** `PROJECT_SECURITY_TODO_LIST.md`
- **Deployment Guide:** `PRODUCTION_DEPLOYMENT_GUIDE.md`
- **AWS EC2 Guide:** `AWS_EC2_DEPLOYMENT_GUIDE.md`
- **Environment Setup:** `ENV_SETUP_GUIDE.md`

---

## 🔄 Update History

- **2025-01-XX**: Initial production checklist yaratildi
- **2025-01-XX**: CORS Production Safety implement qilindi
- **2025-01-XX**: Swagger Security implement qilindi
- **2025-01-XX**: Production .env.example template'lar yaratildi

