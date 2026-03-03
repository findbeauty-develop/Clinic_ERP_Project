# 🚀 To'liq Deployment Guide - Barcha Servislar

Bu qo'llanma **barcha 4 ta servisni** (Backend, Frontend, Supplier-Backend, Supplier-Frontend) Docker Hub'ga push qilish va VPS'ga deploy qilish uchun step-by-step ko'rsatma.

---

## 📋 Talablar

- ✅ Docker va Docker Compose o'rnatilgan
- ✅ Docker Hub account (https://hub.docker.com)
- ✅ VPS server (SSH orqali kirish imkoniyati)
- ✅ Git repository
- ✅ Barcha `.env` fayllar tayyor

---

## 🎯 Servislar va Portlar

| Servis | Port | Docker Image | Container Name |
|--------|------|--------------|----------------|
| Clinic Backend | 3000 | `findbeauty/clinic-backend:latest` | `clinic-erp-backend-prod` |
| Clinic Frontend | 3001 | `findbeauty/clinic-frontend:latest` | `clinic-erp-frontend-prod` |
| Supplier Backend | 3002 | `findbeauty/supplier-backend:latest` | `supplier-erp-backend-prod` |
| Supplier Frontend | 3003 | `findbeauty/supplier-frontend:latest` | `supplier-erp-frontend-prod` |

---

## 📤 QADAM 1: Git'ga Push Qilish

### 1.1. O'zgarishlarni Ko'rish va Commit Qilish

```bash
# Project root directory'ga o'ting
cd /Users/Development/Desktop/Clinic_ERP_Project

# O'zgarishlarni ko'rish
git status

# Barcha o'zgarishlarni qo'shish
git add .

# Commit qilish
git commit -m "Deploy: All services update with supplier-backend and supplier-frontend"

# Main branch'ga push qilish
git push origin main
# yoki
git push origin master
```

**⚠️ Eslatma:** `.env` fayllar `.gitignore`'da bo'lishi kerak. Agar ularni git'ga qo'shmoqchi bo'lsangiz, `.env.example` fayllar yarating.

---

## 🔐 QADAM 2: Docker Hub'ga Login Qilish

```bash
# Docker Hub'ga login qiling
docker login

# Username: findbeauty (yoki sizning username'ingiz)
# Password: [Docker Hub parolingiz]
```

---

## 🏗️ QADAM 3: Docker Buildx'ni Tayyorlash

**⚠️ MUHIM:** Agar macOS (Apple Silicon) yoki boshqa ARM64 mashinada build qilayotgan bo'lsangiz, VPS esa linux/amd64 bo'lsa, multi-platform build qilish kerak.

```bash
# Buildx'ni tekshirish
docker buildx version

# Buildx builder yaratish (agar yo'q bo'lsa)
docker buildx create --use --name multiarch-builder || docker buildx use multiarch-builder

# Builder'ni bootstrap qilish
docker buildx inspect --bootstrap

# Builder'lar ro'yxatini ko'rish
docker buildx ls
```

---

## 🐳 QADAM 4: Image'larni Build va Push Qilish

### 4.1. Clinic Backend Image (Port 3000)

```bash
# Project root directory'da
cd /Users/Development/Desktop/Clinic_ERP_Project

# Backend image'ni build qilish va to'g'ridan-to'g'ri push qilish
docker buildx build \
  --platform linux/amd64 \
  -f apps/backend/Dockerfile \
  -t findbeauty/clinic-backend:latest \
  --push .
```

**⏱️ Build vaqti:** 5-10 daqiqa

### 4.2. Clinic Frontend Image (Port 3001)

```bash
# Frontend image'ni build qilish
# ⚠️ NEXT_PUBLIC_API_URL'ni o'zgartiring (VPS IP yoki domain)
export VPS_IP="YOUR_VPS_IP"  # Masalan: 123.45.67.89
export BACKEND_URL="http://${VPS_IP}:3000"
# yoki domain ishlatsangiz:
# export BACKEND_URL="https://api.yourdomain.com"

docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=${BACKEND_URL} \
  -f apps/frontend/Dockerfile \
  -t findbeauty/clinic-frontend:latest \
  --push .
```

**⏱️ Build vaqti:** 5-10 daqiqa

### 4.3. Supplier Backend Image (Port 3002)

```bash
# Supplier Backend image'ni build qilish va push qilish
docker buildx build \
  --platform linux/amd64 \
  -f apps/supplier-backend/Dockerfile \
  -t findbeauty/supplier-backend:latest \
  --push .
```

**⏱️ Build vaqti:** 5-10 daqiqa

### 4.4. Supplier Frontend Image (Port 3003)

```bash
# Supplier Frontend image'ni build qilish
# ⚠️ NEXT_PUBLIC_API_URL'ni o'zgartiring (Supplier Backend URL)
export SUPPLIER_BACKEND_URL="http://${VPS_IP}:3002"
# yoki domain ishlatsangiz:
# export SUPPLIER_BACKEND_URL="https://supplier-api.yourdomain.com"

docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=${SUPPLIER_BACKEND_URL} \
  -f apps/supplier-frontend/Dockerfile \
  -t findbeauty/supplier-frontend:latest \
  --push .
```

**⏱️ Build vaqti:** 5-10 daqiqa

---

## ✅ QADAM 5: Build Muvaffaqiyatli Bo'lganini Tekshirish

```bash
# Docker Hub'da image'larni tekshirish
# Quyidagi linklarni ochib ko'ring:
# - https://hub.docker.com/r/findbeauty/clinic-backend
# - https://hub.docker.com/r/findbeauty/clinic-frontend
# - https://hub.docker.com/r/findbeauty/supplier-backend
# - https://hub.docker.com/r/findbeauty/supplier-frontend
```

---

## 🖥️ QADAM 6: VPS'ga SSH orqali Kirish

```bash
# VPS'ga SSH orqali kirish
ssh user@your-vps-ip
# yoki
ssh root@your-vps-ip
```

---

## 📁 QADAM 7: VPS'da Project Directory Yaratish

```bash
# Project directory yaratish (agar yo'q bo'lsa)
mkdir -p ~/clinic-erp-project
cd ~/clinic-erp-project

# Git repository'ni clone qilish (agar yo'q bo'lsa)
# git clone https://github.com/your-username/Clinic_ERP_Project.git .
```

---

## 📝 QADAM 8: VPS'da .env Fayllarni Yangilash

### 8.1. Clinic Backend .env

```bash
# .env faylni yaratish yoki yangilash
nano apps/backend/.env
# yoki
vi apps/backend/.env
```

**Muhim o'zgarishlarni qo'shing va saqlang.**

### 8.2. Clinic Frontend .env.local

```bash
nano apps/frontend/.env.local
```

**Muhim o'zgarishlarni qo'shing va saqlang.**

### 8.3. Supplier Backend .env

```bash
nano apps/supplier-backend/.env
```

**Muhim o'zgarishlarni qo'shing va saqlang.**

### 8.4. Supplier Frontend .env.local

```bash
nano apps/supplier-frontend/.env.local
```

**Muhim o'zgarishlarni qo'shing va saqlang.**

**Yoki SCP orqali local mashinadan yuklash:**

```bash
# Local mashinadan (yangi terminal)
cd /Users/Development/Desktop/Clinic_ERP_Project

# .env fayllarni VPS'ga yuklash
scp apps/backend/.env user@your-vps-ip:~/clinic-erp-project/apps/backend/.env
scp apps/frontend/.env.local user@your-vps-ip:~/clinic-erp-project/apps/frontend/.env.local
scp apps/supplier-backend/.env user@your-vps-ip:~/clinic-erp-project/apps/supplier-backend/.env
scp apps/supplier-frontend/.env.local user@your-vps-ip:~/clinic-erp-project/apps/supplier-frontend/.env.local
```

---

## 🐳 QADAM 9: VPS'da Docker Compose File'ni O'rnatish

```bash
# VPS'da project directory'ga o'ting
cd ~/clinic-erp-project

# docker-compose.prod.yml faylni yuklab oling (agar yo'q bo'lsa)
# Git pull qiling yoki faylni yuklab oling
```

---

## 📥 QADAM 10: VPS'da Image'larni Pull Qilish

```bash
# Docker Hub'dan barcha image'larni pull qilish
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest
docker pull findbeauty/supplier-backend:latest
docker pull findbeauty/supplier-frontend:latest
```

**⏱️ Pull vaqti:** Har bir image uchun 2-5 daqiqa

---

## 🚀 QADAM 11: VPS'da Container'larni Ishga Tushirish

### 11.1. Eski Container'larni To'xtatish va O'chirish

```bash
# Eski container'larni to'xtatish
docker-compose -f docker-compose.prod.yml down

# Yoki alohida to'xtatish
docker stop clinic-erp-backend-prod clinic-erp-frontend-prod supplier-erp-backend-prod supplier-erp-frontend-prod 2>/dev/null
docker rm clinic-erp-backend-prod clinic-erp-frontend-prod supplier-erp-backend-prod supplier-erp-frontend-prod 2>/dev/null
```

### 11.2. Yangi Container'larni Ishga Tushirish

```bash
# docker-compose.prod.yml fayl mavjudligini tekshirish
ls -la docker-compose.prod.yml

# Barcha container'larni ishga tushirish
docker-compose -f docker-compose.prod.yml up -d

# Container'lar holatini tekshirish
docker-compose -f docker-compose.prod.yml ps
```

### 11.3. Log'larni Tekshirish

```bash
# Barcha log'larni ko'rish
docker-compose -f docker-compose.prod.yml logs -f

# Yoki alohida log'lar
docker logs -f clinic-erp-backend-prod
docker logs -f clinic-erp-frontend-prod
docker logs -f supplier-erp-backend-prod
docker logs -f supplier-erp-frontend-prod
```

**Ctrl+C** bilan chiqish.

---

## ✅ QADAM 12: Servislarni Tekshirish

### 12.1. Backend Servislarni Tekshirish

```bash
# Clinic Backend (Port 3000)
curl http://localhost:3000/docs
# yoki browser'da: http://YOUR_VPS_IP:3000/docs

# Supplier Backend (Port 3002)
curl http://localhost:3002/docs
# yoki browser'da: http://YOUR_VPS_IP:3002/docs
```

### 12.2. Frontend Servislarni Tekshirish

```bash
# Browser'da ochib ko'ring:
# - Clinic Frontend: http://YOUR_VPS_IP:3001
# - Supplier Frontend: http://YOUR_VPS_IP:3003
```

---

## 🔄 QADAM 13: Keyingi Yangilanishlar Uchun

Keyingi safar faqat o'zgarishlar bo'lganda:

### 13.1. Local Mashinada

```bash
# 1. Git push
git add .
git commit -m "Update: description"
git push origin main

# 2. Image'larni rebuild va push
# Faqat o'zgargan servislarni rebuild qiling
docker buildx build --platform linux/amd64 -f apps/backend/Dockerfile -t findbeauty/clinic-backend:latest --push .
# ... va hokazo
```

### 13.2. VPS'da

```bash
# 1. Yangi image'larni pull qilish
docker pull findbeauty/clinic-backend:latest
# ... va hokazo

# 2. Container'larni qayta ishga tushirish
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

---

## 🛠️ Troubleshooting

### Muammo: Image build qilishda xatolik

```bash
# Buildx cache'ni tozalash
docker buildx prune -a

# Qayta build qilish
```

### Muammo: Container ishlamayapti

```bash
# Log'larni tekshirish
docker logs container-name

# Container'ni qayta ishga tushirish
docker restart container-name
```

### Muammo: Port allaqachon band

```bash
# Port'ni ishlatayotgan process'ni topish
sudo lsof -i :3000
sudo lsof -i :3001
sudo lsof -i :3002
sudo lsof -i :3003

# Process'ni to'xtatish
sudo kill -9 PID
```

### Muammo: .env fayl topilmayapti

```bash
# .env fayl mavjudligini tekshirish
ls -la apps/backend/.env
ls -la apps/frontend/.env.local
ls -la apps/supplier-backend/.env
ls -la apps/supplier-frontend/.env.local

# Agar yo'q bo'lsa, yarating
touch apps/backend/.env
# va kerakli o'zgarishlarni qo'shing
```

---

## 📊 Deployment Checklist

- [ ] Git'ga push qilindi
- [ ] Docker Hub'ga login qilindi
- [ ] Buildx tayyorlandi
- [ ] Clinic Backend image build va push qilindi
- [ ] Clinic Frontend image build va push qilindi
- [ ] Supplier Backend image build va push qilindi
- [ ] Supplier Frontend image build va push qilindi
- [ ] VPS'ga SSH orqali kirildi
- [ ] Project directory yaratildi/yangilandi
- [ ] Barcha .env fayllar yangilandi
- [ ] docker-compose.prod.yml fayl mavjud
- [ ] Barcha image'lar pull qilindi
- [ ] Container'lar ishga tushirildi
- [ ] Barcha servislar ishlayapti
- [ ] Log'lar tekshirildi
- [ ] Browser'da test qilindi

---

## 🎉 Tugadi!

Endi barcha 4 ta servis VPS'da ishlayapti:
- ✅ Clinic Backend: `http://YOUR_VPS_IP:3000`
- ✅ Clinic Frontend: `http://YOUR_VPS_IP:3001`
- ✅ Supplier Backend: `http://YOUR_VPS_IP:3002`
- ✅ Supplier Frontend: `http://YOUR_VPS_IP:3003`

**Muvaffaqiyatli deployment! 🚀**

