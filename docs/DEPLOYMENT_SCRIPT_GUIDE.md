# 🚀 Production Deployment Script Qo'llanmasi

## Umumiy Ma'lumot

`deploy-production.sh` - Production'ga xavfsiz deploy qilish uchun to'liq workflow script'i.

Bu script quyidagilarni avtomatik bajaradi:
- ✅ Git branch tekshirish va merge
- ✅ Environment variables tekshirish
- ✅ Database migration status tekshirish
- ✅ Build test
- ✅ Docker build va push
- ✅ Xavfsizlik tekshiruvlari

---

## 📋 Talablar

1. **Git** o'rnatilgan bo'lishi kerak
2. **Docker** va **Docker Buildx** o'rnatilgan bo'lishi kerak
3. **Node.js** va **npm** o'rnatilgan bo'lishi kerak
4. **Docker Hub** account va login qilingan bo'lishi kerak
5. `.env.production` fayllar to'ldirilgan bo'lishi kerak

---

## 🚀 Ishlatish

### Asosiy Ishlatish

```bash
# Script'ni executable qilish (bir marta)
chmod +x deploy-production.sh

# Script'ni ishga tushirish
./deploy-production.sh
```

### Flag'lar bilan Ishlatish

```bash
# Pre-deployment checks'ni o'tkazib yuborish
./deploy-production.sh --skip-checks

# Git merge'ni o'tkazib yuborish (master branch'da bo'lsangiz)
./deploy-production.sh --skip-merge

# Docker build'ni o'tkazib yuborish (faqat push)
./deploy-production.sh --skip-build

# Barcha flag'lar bilan
./deploy-production.sh --skip-checks --skip-merge --skip-build
```

---

## 📝 Script Qadamlar

### STEP 1: Git Branch Tekshirish

- Hozirgi branch'ni tekshiradi
- Agar `develop` branch'da bo'lsangiz, `master`'ga merge qilishni taklif qiladi
- Uncommitted o'zgarishlar bo'lsa, commit qilishni taklif qiladi
- `master` branch'ni remote'ga push qiladi

### STEP 2: Environment Variables Tekshirish

Quyidagi fayllarni tekshiradi:
- `apps/backend/.env.production`
  - `CORS_ORIGINS` (majburiy)
  - `DATABASE_URL` (majburiy)
  - `JWT_SECRET` (majburiy)
- `apps/frontend/.env.production`
  - `NEXT_PUBLIC_API_URL` (majburiy)
- `apps/supplier-backend/.env.production` (ixtiyoriy)

### STEP 3: Database Migration Status Tekshirish

- Prisma migration status'ni tekshiradi
- Production database'ga ulanishni tekshiradi
- Migration'lar apply qilinganligini tekshiradi

### STEP 4: Build Test

- Backend TypeScript compilation test
- Frontend dependencies tekshirish
- Build xatolarini aniqlash

### STEP 5: Docker Tekshirish

- Docker o'rnatilganligini tekshiradi
- Docker Hub login holatini tekshiradi
- Docker Buildx mavjudligini tekshiradi

### STEP 6: Docker Build va Push

- VPS IP yoki domain'ni so'raydi
- Qaysi servislarni build qilishni so'raydi:
  1. Barcha servislar
  2. Faqat Backend'lar
  3. Faqat Frontend'lar
  4. Faqat Clinic servislar
  5. Faqat Supplier servislar
- Docker image'larni build va push qiladi

---

## ⚙️ Konfiguratsiya

Script ichida quyidagi o'zgaruvchilarni o'zgartirishingiz mumkin:

```bash
# Docker Hub username
DOCKER_USERNAME="findbeauty"

# Production branch (default: master)
PRODUCTION_BRANCH="master"

# Development branch (default: develop)
DEVELOP_BRANCH="develop"
```

---

## 🔒 Xavfsizlik

Script quyidagi xavfsizlik tekshiruvlarini bajaradi:

1. **Git Branch**: Faqat `master` branch'dan deploy qilish
2. **Environment Variables**: Barcha majburiy env'lar mavjudligini tekshirish
3. **CORS Configuration**: Production'da `CORS_ORIGINS` majburiy
4. **Database**: Migration status tekshirish
5. **Build Test**: Compilation xatolarini aniqlash

---

## 📋 Pre-deployment Checklist

Script ishga tushirishdan oldin quyidagilarni tekshiring:

- [ ] `apps/backend/.env.production` fayl mavjud va to'ldirilgan
- [ ] `apps/frontend/.env.production` fayl mavjud va to'ldirilgan
- [ ] `CORS_ORIGINS` to'g'ri sozlangan (production domain'lar)
- [ ] `DATABASE_URL` production database'ga ishora qiladi
- [ ] `JWT_SECRET` kuchli va xavfsiz
- [ ] Docker Hub'ga login qilingan
- [ ] Git'da barcha o'zgarishlar commit qilingan
- [ ] `develop` branch'da ishlayapsiz

---

## 🐛 Xatoliklar va Yechimlar

### Xatolik: "CORS_ORIGINS bo'sh!"

**Yechim:**
```bash
# apps/backend/.env.production faylga qo'shing:
CORS_ORIGINS=https://clinic.jaclit.com,https://supplier.jaclit.com
```

### Xatolik: "Docker Hub'ga login qilmagansiz"

**Yechim:**
```bash
docker login
# Username va password kiriting
```

### Xatolik: "Git merge conflict"

**Yechim:**
```bash
# Conflict'larni hal qiling:
git status
# Conflict fayllarni tahrirlang
git add .
git commit -m "Resolve merge conflicts"
git push origin master
```

### Xatolik: "Migration status xatosi"

**Yechim:**
```bash
cd apps/backend
# Production DATABASE_URL'ni export qiling
export DATABASE_URL="postgresql://..."
export DIRECT_URL="postgresql://..."
npx prisma migrate deploy
npx prisma generate
```

---

## 📊 Script Output

Script quyidagi rangli output'lar bilan ishlaydi:

- 🟢 **Yashil** - Muvaffaqiyatli operatsiyalar
- 🔵 **Ko'k** - Ma'lumotlar va tekshiruvlar
- 🟡 **Sariq** - Ogohlantirishlar
- 🔴 **Qizil** - Xatoliklar

---

## 🔄 Keyingi Qadamlar (Production Server'da)

Script muvaffaqiyatli yakunlangandan keyin:

1. **SSH orqali production server'ga kirish:**
   ```bash
   ssh user@YOUR_VPS_IP
   ```

2. **Project directory'ga o'tish:**
   ```bash
   cd ~/clinic-erp
   ```

3. **Yangi image'larni pull qilish:**
   ```bash
   docker compose -f docker-compose.prod.yml pull
   ```

4. **Container'larni yangilash:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --force-recreate
   ```

5. **Log'larni tekshirish:**
   ```bash
   docker compose -f docker-compose.prod.yml logs -f
   ```

6. **Health check:**
   ```bash
   curl https://your-domain.com/health
   ```

---

## 💡 Maslahatlar

1. **Avval development'da test qiling**: Production'ga chiqishdan oldin development'da to'liq test qiling
2. **Backup oling**: Production database'ni backup qiling
3. **Gradual deployment**: Kichik o'zgarishlarni bir vaqtning o'zida deploy qiling
4. **Monitoring**: Deployment'dan keyin log'larni kuzatib boring
5. **Rollback plan**: Agar muammo bo'lsa, rollback qilish rejasini tayyorlang

---

## 📞 Yordam

Agar muammo bo'lsa:

1. Script output'ini tekshiring
2. Log fayllarni ko'rib chiqing
3. `PRODUCTION_CHECKLIST.md` faylini tekshiring
4. `PROJECT_SECURITY_TODO_LIST.md` faylini tekshiring

---

## ✅ Muvaffaqiyatli Deployment

Deployment muvaffaqiyatli bo'lsa, quyidagilarni tekshiring:

- ✅ Barcha servislar ishlamoqda
- ✅ Database ulanishi ishlayapti
- ✅ CORS to'g'ri sozlangan
- ✅ SSL sertifikat ishlayapti
- ✅ Log'lar normal
- ✅ Health check muvaffaqiyatli

---

**Yaratilgan:** 2026-01-22  
**Versiya:** 1.0.0

