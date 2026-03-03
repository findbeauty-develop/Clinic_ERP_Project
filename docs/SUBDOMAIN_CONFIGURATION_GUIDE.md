# 🌐 Subdomain Configuration Guide
## `supplier.jaclit.com` va `clinic.jaclit.com` uchun o'zgartirishlar

Bu hujjat subdomain'lar (`supplier.jaclit.com` va `clinic.jaclit.com`) uchun barcha `.env` va `.env.local` fayllarida qanday o'zgartirishlar qilish kerakligini ko'rsatadi.

---

## 📋 O'zgartirish Kerak Bo'lgan Fayllar

### 1. ✅ `apps/backend/.env.production` (Clinic Backend)

**O'zgartirish kerak bo'lgan variable'lar:**

```bash
# ⚠️ O'ZGARTIRISH KERAK:
CORS_ORIGINS=https://clinic.jaclit.com,https://supplier.jaclit.com

# ⚠️ O'ZGARTIRISH KERAK (agar API subdomain bo'lsa):
CLINIC_BACKEND_URL=https://api.jaclit.com
# yoki agar bir xil subdomain'da bo'lsa:
# CLINIC_BACKEND_URL=https://clinic.jaclit.com

# ⚠️ O'ZGARTIRISH KERAK (agar API subdomain bo'lsa):
SUPPLIER_BACKEND_URL=https://api-supplier.jaclit.com
# yoki agar bir xil subdomain'da bo'lsa:
# SUPPLIER_BACKEND_URL=https://supplier.jaclit.com
```

**To'liq misol:**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres

# ✅ O'ZGARTIRILDI
CORS_ORIGINS=https://clinic.jaclit.com,https://supplier.jaclit.com

JWT_SECRET=your_super_secure_jwt_secret_production_2025_min_32_chars
MEMBER_JWT_EXPIRES_IN=15m
MEMBER_JWT_REFRESH_EXPIRES_IN=7d

# ✅ O'ZGARTIRILDI
CLINIC_BACKEND_URL=https://api.jaclit.com
SUPPLIER_BACKEND_URL=https://api-supplier.jaclit.com
SUPPLIER_BACKEND_API_KEY=your_secret_api_key_here_min_32_chars

GOOGLE_APPLICATION_CREDENTIALS=./keys/clinic-ocr-prod-aeccdd231e2e.json
SOLAPI_API_KEY=your_solapi_api_key
SOLAPI_API_SECRET=your_solapi_api_secret
SOLAPI_SENDER_PHONE=01012345678
HIRA_API_KEY=your_hira_api_key
HIRA_API_SECRET=your_hira_api_secret
PORT=3000
```

---

### 2. ✅ `apps/frontend/.env.production` (Clinic Frontend)

**O'zgartirish kerak bo'lgan variable'lar:**

```bash
# ⚠️ O'ZGARTIRISH KERAK:
NEXT_PUBLIC_API_URL=https://api.jaclit.com
# yoki agar backend bir xil subdomain'da bo'lsa:
# NEXT_PUBLIC_API_URL=https://clinic.jaclit.com
```

**To'liq misol:**
```bash
NODE_ENV=production

# ✅ O'ZGARTIRILDI
NEXT_PUBLIC_API_URL=https://api.jaclit.com

NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

### 3. ✅ `apps/supplier-backend/.env.production` (Supplier Backend)

**O'zgartirish kerak bo'lgan variable'lar:**

```bash
# ⚠️ O'ZGARTIRISH KERAK:
CORS_ORIGINS=https://clinic.jaclit.com,https://supplier.jaclit.com

# ⚠️ O'ZGARTIRISH KERAK (agar API subdomain bo'lsa):
SUPPLIER_BACKEND_URL=https://api-supplier.jaclit.com
# yoki agar bir xil subdomain'da bo'lsa:
# SUPPLIER_BACKEND_URL=https://supplier.jaclit.com

# ⚠️ O'ZGARTIRISH KERAK (agar API subdomain bo'lsa):
CLINIC_BACKEND_URL=https://api.jaclit.com
# yoki agar bir xil subdomain'da bo'lsa:
# CLINIC_BACKEND_URL=https://clinic.jaclit.com
```

**To'liq misol:**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[PROD-PROJECT-REF]:[PROD-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres

# ✅ O'ZGARTIRILDI
CORS_ORIGINS=https://clinic.jaclit.com,https://supplier.jaclit.com

JWT_SECRET=your_super_secure_jwt_secret_production_2025_min_32_chars

# ✅ O'ZGARTIRILDI
SUPPLIER_BACKEND_URL=https://api-supplier.jaclit.com
CLINIC_BACKEND_URL=https://api.jaclit.com
SUPPLIER_BACKEND_API_KEY=your_secret_api_key_here_min_32_chars

SOLAPI_API_KEY=your_solapi_api_key
SOLAPI_API_SECRET=your_solapi_api_secret
SOLAPI_SENDER_PHONE=01012345678
PORT=3002
```

---

### 4. ✅ `apps/supplier-frontend/.env.production` (Supplier Frontend)

**⚠️ Eslatma:** Bu fayl hozir mavjud emas, yaratish kerak!

**Yaratish va o'zgartirish kerak bo'lgan variable'lar:**

```bash
# ⚠️ O'ZGARTIRISH KERAK:
NEXT_PUBLIC_API_URL=https://api-supplier.jaclit.com
# yoki agar backend bir xil subdomain'da bo'lsa:
# NEXT_PUBLIC_API_URL=https://supplier.jaclit.com
```

**To'liq misol:**
```bash
NODE_ENV=production

# ✅ O'ZGARTIRILDI
NEXT_PUBLIC_API_URL=https://api-supplier.jaclit.com

NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

### 5. ✅ `docker-compose.prod.yml`

**O'zgartirish kerak bo'lgan joylar:**

```yaml
services:
  frontend:
    environment:
      - NODE_ENV=production
      # ⚠️ O'ZGARTIRISH KERAK (Line 43):
      - NEXT_PUBLIC_API_URL=https://api.jaclit.com

  supplier-backend:
    environment:
      # ⚠️ O'ZGARTIRISH KERAK (Line 64):
      - CORS_ORIGINS=https://clinic.jaclit.com,https://supplier.jaclit.com

  supplier-frontend:
    environment:
      - NODE_ENV=production
      # ⚠️ O'ZGARTIRISH KERAK (Line 93):
      - NEXT_PUBLIC_API_URL=https://api-supplier.jaclit.com
```

**To'liq misol:**
```yaml
version: "3.8"

services:
  backend:
    # ... existing config ...
    env_file:
      - ./apps/backend/.env.production  # ✅ .env o'rniga .env.production
    environment:
      - SUPPLIER_BACKEND_URL=http://supplier-erp-backend-prod:3002
      - SUPPLIER_BACKEND_API_KEY=your_secret_api_key_here_34534sdffsd69ds8f8e9sdf89sd4e9e8w9f

  frontend:
    # ... existing config ...
    environment:
      - NODE_ENV=production
      # ✅ O'ZGARTIRILDI
      - NEXT_PUBLIC_API_URL=https://api.jaclit.com
    env_file:
      - ./apps/frontend/.env.production  # ✅ .env.local o'rniga .env.production

  supplier-backend:
    # ... existing config ...
    env_file:
      - ./apps/supplier-backend/.env.production  # ✅ .env o'rniga .env.production
    environment:
      - CLINIC_BACKEND_URL=http://clinic-erp-backend-prod:3000
      - SUPPLIER_BACKEND_API_KEY=your_secret_api_key_here_34534sdffsd69ds8f8e9sdf89sd4e9e8w9f
      # ✅ O'ZGARTIRILDI
      - CORS_ORIGINS=https://clinic.jaclit.com,https://supplier.jaclit.com

  supplier-frontend:
    # ... existing config ...
    environment:
      - NODE_ENV=production
      # ✅ O'ZGARTIRILDI
      - NEXT_PUBLIC_API_URL=https://api-supplier.jaclit.com
    env_file:
      - ./apps/supplier-frontend/.env.production  # ✅ .env.local o'rniga .env.production
```

---

## 📝 O'zgartirishlar Ro'yxati (Checklist)

### Backend Fayllar:
- [ ] `apps/backend/.env.production` - `CORS_ORIGINS` o'zgartirish
- [ ] `apps/backend/.env.production` - `CLINIC_BACKEND_URL` o'zgartirish
- [ ] `apps/backend/.env.production` - `SUPPLIER_BACKEND_URL` o'zgartirish
- [ ] `apps/supplier-backend/.env.production` - `CORS_ORIGINS` o'zgartirish
- [ ] `apps/supplier-backend/.env.production` - `SUPPLIER_BACKEND_URL` o'zgartirish
- [ ] `apps/supplier-backend/.env.production` - `CLINIC_BACKEND_URL` o'zgartirish

### Frontend Fayllar:
- [ ] `apps/frontend/.env.production` - `NEXT_PUBLIC_API_URL` o'zgartirish
- [ ] `apps/supplier-frontend/.env.production` - YARATISH va `NEXT_PUBLIC_API_URL` o'zgartirish

### Docker Compose:
- [ ] `docker-compose.prod.yml` - `frontend` service: `NEXT_PUBLIC_API_URL` o'zgartirish
- [ ] `docker-compose.prod.yml` - `supplier-backend` service: `CORS_ORIGINS` o'zgartirish
- [ ] `docker-compose.prod.yml` - `supplier-frontend` service: `NEXT_PUBLIC_API_URL` o'zgartirish
- [ ] `docker-compose.prod.yml` - Barcha `env_file` path'larni `.env.production` ga o'zgartirish

---

## 🎯 Tavsiya Etilgan Struktura

### Variant 1: Alohida API Subdomain'lar (Tavsiya Etiladi) ✅

```
clinic.jaclit.com          → Clinic Frontend (Port 3001)
supplier.jaclit.com        → Supplier Frontend (Port 3003)
api.jaclit.com             → Clinic Backend (Port 3000)
api-supplier.jaclit.com    → Supplier Backend (Port 3002)
```

**Afzalliklari:**
- API va Frontend ajratilgan
- Xavfsizlik yaxshiroq
- Scaling osonroq

### Variant 2: Bir Xil Subdomain (Oddiy)

```
clinic.jaclit.com          → Clinic Frontend + Backend (Port 3001 + 3000)
supplier.jaclit.com        → Supplier Frontend + Backend (Port 3003 + 3002)
```

**Afzalliklari:**
- Oddiy konfiguratsiya
- Kamroq subdomain'lar

---

## ⚠️ Muhim Eslatmalar

1. **HTTPS ishlatish kerak:** Production'da faqat `https://` ishlatish kerak, `http://` emas!
2. **CORS_ORIGINS majburiy:** Production'da `CORS_ORIGINS` bo'sh bo'lsa error throw qilinadi
3. **Docker Compose env_file:** `.env` o'rniga `.env.production` ishlatish kerak
4. **Frontend rebuild:** `NEXT_PUBLIC_API_URL` o'zgargandan keyin frontend'ni rebuild qilish kerak
5. **DNS sozlash:** Subdomain'lar uchun DNS A yoki CNAME record'lar sozlash kerak

---

## 🚀 Qadamlar

1. ✅ Barcha `.env.production` fayllarini yaratish/yangilash
2. ✅ `docker-compose.prod.yml`'ni yangilash
3. ✅ DNS sozlash (A yoki CNAME record'lar)
4. ✅ SSL sertifikat o'rnatish (Let's Encrypt)
5. ✅ Nginx config yaratish (agar ishlatilsa)
6. ✅ Docker container'larni rebuild va restart qilish

---

## 📚 Qo'shimcha Ma'lumot

- **Production Checklist:** `PRODUCTION_CHECKLIST.md`
- **Security Checklist:** `PROJECT_SECURITY_TODO_LIST.md`
- **Deployment Guide:** `PRODUCTION_DEPLOYMENT_GUIDE.md`

