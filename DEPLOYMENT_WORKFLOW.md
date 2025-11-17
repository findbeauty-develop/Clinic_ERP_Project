# Deployment Workflow - O'zgarishlarni Deploy Qilish Qo'llanmasi

Bu qo'llanma sizga kod o'zgarishlaridan keyin production'ga deploy qilish jarayonini ko'rsatadi.

---

## 📋 Umumiy Jarayon

1. **Lokal mashinada o'zgarishlar qilish**
2. **GitHub'ga push qilish**
3. **Docker image'larni build qilish**
4. **Docker Hub'ga push qilish**
5. **VPS'da yangilash**

---

## 🚀 QADAM 1: Lokal Mashinada O'zgarishlar Qilish

### 1.1. O'zgarishlarni qilish

```bash
cd /Users/khislatbek/Desktop/Clinic_ERP_Project

# Kod o'zgarishlarini qilish
# ...
```

### 1.2. O'zgarishlarni tekshirish

```bash
# TypeScript xatolarini tekshirish
pnpm --filter @erp/backend build
pnpm --filter @erp/frontend build

# Linter ishlatish (agar mavjud bo'lsa)
pnpm --filter @erp/backend lint
pnpm --filter @erp/frontend lint
```

### 1.3. Lokal test qilish

```bash
# Backend'ni lokalda ishga tushirish
cd apps/backend
pnpm dev

# Frontend'ni lokalda ishga tushirish (yangi terminal)
cd apps/frontend
pnpm dev
```

---

## 📤 QADAM 2: GitHub'ga Push Qilish

### 2.1. O'zgarishlarni commit qilish

```bash
cd /Users/khislatbek/Desktop/Clinic_ERP_Project

# O'zgarishlarni ko'rish
git status

# Barcha o'zgarishlarni qo'shish
git add .

# Commit qilish
git commit -m "Your commit message here"

# GitHub'ga push qilish
git push origin develop
```

### 2.2. Agar xato bo'lsa

```bash
# Agar lockfile o'zgarganda xato bo'lsa
git add pnpm-lock.yaml
git commit -m "Update lockfile"
git push origin develop
```

---

## 🐳 QADAM 3: Docker Image'larni Build Qilish

### 3.1. Backend Image'ni Build Qilish

```bash
cd /Users/khislatbek/Desktop/Clinic_ERP_Project

# Backend image'ni build qilish
docker build -t findbeauty/clinic-backend:latest -f apps/backend/Dockerfile .

# Build muvaffaqiyatli bo'lgandan keyin, test qilish (ixtiyoriy)
docker run --rm -p 3000:3000 --env-file apps/backend/.env findbeauty/clinic-backend:latest
# Ctrl+C bilan to'xtatish
```

### 3.2. Frontend Image'ni Build Qilish

```bash
# Frontend image'ni build qilish (build vaqtida API URL berish)
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 \
  -t findbeauty/clinic-frontend:latest \
  -f apps/frontend/Dockerfile .

# Build muvaffaqiyatli bo'lgandan keyin, test qilish (ixtiyoriy)
docker run --rm -p 3001:3001 \
  -e NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 \
  -e NODE_ENV=production \
  findbeauty/clinic-frontend:latest
# Ctrl+C bilan to'xtatish
```

**Eslatma:** Frontend build qilishda `--build-arg NEXT_PUBLIC_API_URL` berilishi kerak!

---

## 📦 QADAM 4: Docker Hub'ga Push Qilish

### 4.1. Docker Hub'ga Login Qilish

```bash
# Docker Hub'ga login qilish
docker login
# Username: findbeauty
# Password: (Docker Hub parolingiz)
```

### 4.2. Image'larni Push Qilish

```bash
# Backend image'ni push qilish
docker push findbeauty/clinic-backend:latest

# Frontend image'ni push qilish
docker push findbeauty/clinic-frontend:latest
```

### 4.3. Push Jarayonini Kuzatish

- Progress ko'rinadi
- Tugagach, Docker Hub'da image'lar yangilangan bo'ladi

---

## 🔄 QADAM 5: VPS'da Yangilash

### 5.1. VPS'ga SSH orqali Kirish

```bash
ssh root@your-vps-ip
# yoki
ssh username@your-vps-ip
```

### 5.2. Backend'ni Yangilash

```bash
# 1. Eski konteynerni to'xtatish va o'chirish
docker stop clinic-backend
docker rm clinic-backend

# 2. Yangi image'ni pull qilish
docker pull findbeauty/clinic-backend:latest

# 3. Yangi konteynerni ishga tushirish
docker run -d \
  --name clinic-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file ~/clinic-erp/apps/backend/.env \
  findbeauty/clinic-backend:latest

# 4. Statusni tekshirish
docker logs -f clinic-backend
# Agar hamma narsa to'g'ri bo'lsa, Ctrl+C bilan chiqish
```

### 5.3. Frontend'ni Yangilash

```bash
# 1. Eski konteynerni to'xtatish va o'chirish
docker stop clinic-frontend
docker rm clinic-frontend

# 2. Yangi image'ni pull qilish
docker pull findbeauty/clinic-frontend:latest

# 3. Yangi konteynerni ishga tushirish
docker run -d \
  --name clinic-frontend \
  --restart unless-stopped \
  -p 3001:3001 \
  -e NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 \
  -e NODE_ENV=production \
  findbeauty/clinic-frontend:latest

# 4. Statusni tekshirish
docker logs -f clinic-frontend
# Agar hamma narsa to'g'ri bo'lsa, Ctrl+C bilan chiqish
```

### 5.4. Statusni Tekshirish

```bash
# Barcha konteynerlarni ko'rish
docker ps

# Backend loglarini ko'rish
docker logs --tail 50 clinic-backend

# Frontend loglarini ko'rish
docker logs --tail 50 clinic-frontend

# Test qilish
curl http://localhost:3000/docs
curl http://localhost:3001
```

---

## 🔄 Qisqa Versiya (Tezkor Deploy)

Agar tez deploy qilmoqchi bo'lsangiz:

### Lokal Mashinada:

```bash
cd /Users/khislatbek/Desktop/Clinic_ERP_Project

# 1. GitHub'ga push
git add . && git commit -m "Your changes" && git push origin develop

# 2. Backend build va push
docker build -t findbeauty/clinic-backend:latest -f apps/backend/Dockerfile . && \
docker push findbeauty/clinic-backend:latest

# 3. Frontend build va push
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 \
  -t findbeauty/clinic-frontend:latest \
  -f apps/frontend/Dockerfile . && \
docker push findbeauty/clinic-frontend:latest
```

### VPS'da:

```bash
# Backend yangilash
docker stop clinic-backend && docker rm clinic-backend && \
docker pull findbeauty/clinic-backend:latest && \
docker run -d --name clinic-backend --restart unless-stopped -p 3000:3000 --env-file ~/clinic-erp/apps/backend/.env findbeauty/clinic-backend:latest

# Frontend yangilash
docker stop clinic-frontend && docker rm clinic-frontend && \
docker pull findbeauty/clinic-frontend:latest && \
docker run -d --name clinic-frontend --restart unless-stopped -p 3001:3001 -e NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 -e NODE_ENV=production findbeauty/clinic-frontend:latest
```

---

## 🛠️ Muammolarni Hal Qilish

### Muammo 1: Build Xatosi

**Backend build xatosi:**

```bash
# Cache'ni tozalash
docker build --no-cache -t findbeauty/clinic-backend:latest -f apps/backend/Dockerfile .

# Lockfile muammosi bo'lsa
# Dockerfile'da --no-frozen-lockfile ishlatilganini tekshirish
```

**Frontend build xatosi:**

```bash
# Cache'ni tozalash
docker build --no-cache \
  --build-arg NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 \
  -t findbeauty/clinic-frontend:latest \
  -f apps/frontend/Dockerfile .
```

### Muammo 2: Push Xatosi

```bash
# Docker Hub'ga login qilishni tekshirish
docker login

# Image'lar mavjudligini tekshirish
docker images | grep clinic

# Qayta push qilish
docker push findbeauty/clinic-backend:latest
docker push findbeauty/clinic-frontend:latest
```

### Muammo 3: VPS'da Pull Xatosi

```bash
# Docker Hub'ga ulanishni tekshirish
ping registry-1.docker.io

# Qayta pull qilish
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest
```

### Muammo 4: Konteyner Ishlamayapti

```bash
# Loglarni ko'rish
docker logs clinic-backend
docker logs clinic-frontend

# Environment variable'larni tekshirish
docker exec clinic-backend env | grep SUPABASE
docker exec clinic-frontend env | grep NEXT_PUBLIC

# Konteynerni qayta ishga tushirish
docker restart clinic-backend
docker restart clinic-frontend
```

### Muammo 5: Architecture Mismatch

Agar VPS x86_64 va lokal mashina ARM bo'lsa:

**Lokal mashinada (Mac M1/M2):**

```bash
# x86_64 uchun build qilish
docker build --platform linux/amd64 -t findbeauty/clinic-backend:latest -f apps/backend/Dockerfile .
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 \
  -t findbeauty/clinic-frontend:latest \
  -f apps/frontend/Dockerfile .
```

**Yoki VPS'da build qilish:**

```bash
# VPS'da
cd /tmp/Clinic_ERP_Project
git pull origin develop
docker build -t findbeauty/clinic-backend:latest -f apps/backend/Dockerfile .
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 \
  -t findbeauty/clinic-frontend:latest \
  -f apps/frontend/Dockerfile .
```

---

## 📝 Checklist - Har Bir Deploy'da

Deploy qilishdan oldin quyidagilarni tekshiring:

- [ ] Kod o'zgarishlari test qilingan
- [ ] GitHub'ga push qilingan
- [ ] Backend image build qilingan va test qilingan
- [ ] Frontend image build qilingan va test qilingan
- [ ] Docker Hub'ga push qilingan
- [ ] VPS'da eski konteynerlar to'xtatilgan
- [ ] Yangi image'lar pull qilingan
- [ ] Yangi konteynerlar ishga tushirilgan
- [ ] Loglar tekshirilgan (xato yo'q)
- [ ] Production'da test qilingan

---

## 🔄 Avtomatlashtirish (Ixtiyoriy)

### Script Yaratish

**Lokal mashinada `deploy.sh` yaratish:**

```bash
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# 1. GitHub push
echo "📤 Pushing to GitHub..."
git add .
git commit -m "$1" || echo "No changes to commit"
git push origin develop

# 2. Backend build and push
echo "🐳 Building backend..."
docker build -t findbeauty/clinic-backend:latest -f apps/backend/Dockerfile .
docker push findbeauty/clinic-backend:latest

# 3. Frontend build and push
echo "🐳 Building frontend..."
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 \
  -t findbeauty/clinic-frontend:latest \
  -f apps/frontend/Dockerfile .
docker push findbeauty/clinic-frontend:latest

echo "✅ Deployment complete! Now update on VPS."
```

**Ishlatish:**

```bash
chmod +x deploy.sh
./deploy.sh "Your commit message"
```

**VPS'da `update.sh` yaratish:**

```bash
#!/bin/bash
set -e

echo "🔄 Updating services..."

# Backend update
echo "🔄 Updating backend..."
docker stop clinic-backend && docker rm clinic-backend
docker pull findbeauty/clinic-backend:latest
docker run -d --name clinic-backend --restart unless-stopped -p 3000:3000 --env-file ~/clinic-erp/apps/backend/.env findbeauty/clinic-backend:latest

# Frontend update
echo "🔄 Updating frontend..."
docker stop clinic-frontend && docker rm clinic-frontend
docker pull findbeauty/clinic-frontend:latest
docker run -d --name clinic-frontend --restart unless-stopped -p 3001:3001 -e NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 -e NODE_ENV=production findbeauty/clinic-frontend:latest

echo "✅ Update complete!"
docker ps
```

**Ishlatish:**

```bash
chmod +x update.sh
./update.sh
```

---

## 📊 Deployment Vaqti

- **GitHub push:** ~30 soniya
- **Backend build:** ~3-5 daqiqa
- **Frontend build:** ~5-10 daqiqa
- **Docker Hub push:** ~2-5 daqiqa
- **VPS pull va restart:** ~1-2 daqiqa

**Jami:** ~15-25 daqiqa

---

## 🎯 Eng Tezkor Deploy (Agar Faqat Kod O'zgarganda)

Agar faqat kod o'zgarganda va Dockerfile o'zgarmagan bo'lsa:

### VPS'da Build Qilish (Tezkor)

```bash
# VPS'ga kirish
ssh root@your-vps-ip

# Kodni yangilash
cd /tmp/Clinic_ERP_Project
git pull origin develop

# Backend'ni qayta build qilish
docker stop clinic-backend && docker rm clinic-backend
docker build -t findbeauty/clinic-backend:latest -f apps/backend/Dockerfile .
docker run -d --name clinic-backend --restart unless-stopped -p 3000:3000 --env-file ~/clinic-erp/apps/backend/.env findbeauty/clinic-backend:latest

# Frontend'ni qayta build qilish
docker stop clinic-frontend && docker rm clinic-frontend
docker build --build-arg NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 -t findbeauty/clinic-frontend:latest -f apps/frontend/Dockerfile .
docker run -d --name clinic-frontend --restart unless-stopped -p 3001:3001 -e NEXT_PUBLIC_API_URL=http://72.60.108.46:3000 -e NODE_ENV=production findbeauty/clinic-frontend:latest
```

**Afzalligi:** Docker Hub push qilish shart emas, tezroq  
**Kamchiligi:** VPS'da build qilish kerak

---

## 🔐 Xavfsizlik Eslatmalari

1. **.env fayllarni Git'ga commit qilmang**
2. **Docker Hub'da private repository ishlatish tavsiya etiladi**
3. **Production'da environment variable'larni to'g'ri sozlang**
4. **Regular backup qiling**

---

## 📞 Yordam

Agar muammo bo'lsa:

1. Loglarni tekshiring: `docker logs clinic-backend` / `docker logs clinic-frontend`
2. Konteyner holatini ko'ring: `docker ps -a`
3. Environment variable'larni tekshiring: `docker exec clinic-backend env`

**Muvaffaqiyatlar! 🚀**
