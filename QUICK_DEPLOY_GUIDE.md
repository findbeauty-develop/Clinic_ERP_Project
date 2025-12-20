# 🚀 Tezkor Deployment Guide - O'zgarishlar bilan

Bu qisqa qo'llanma sizning o'zgarishlaringizni Docker Hub va VPS'ga deploy qilish uchun.

---

## 📤 QADAM 1: Git'ga Push Qilish

```bash
# Project root directory'ga o'ting
cd /Users/Development/Desktop/Clinic_ERP_Project

# O'zgarishlarni ko'rish
git status

# Barcha o'zgarishlarni qo'shish
git add .

# Commit qilish
git commit -m "Update: Prepared statements fix and other improvements"

# Main branch'ga push qilish
git push origin main
# yoki
git push origin master
```

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

```bash
# Buildx'ni tekshirish
docker buildx version

# Buildx builder yaratish yoki faollashtirish
docker buildx create --use --name multiarch-builder 2>/dev/null || docker buildx use multiarch-builder

# Builder'ni bootstrap qilish
docker buildx inspect --bootstrap
```

---

## 🐳 QADAM 4: Image'larni Build va Push Qilish

### 4.1. Clinic Backend Image (Port 3000)

```bash
# Project root directory'da
cd /Users/Development/Desktop/Clinic_ERP_Project

# Backend image'ni build qilish va push qilish
docker buildx build \
  --platform linux/amd64 \
  -f apps/backend/Dockerfile \
  -t findbeauty/clinic-backend:latest \
  --push .
```

**⏱️ Build vaqti:** 5-10 daqiqa

### 4.2. Clinic Frontend Image (Port 3001)

```bash
# VPS IP yoki domain'ni belgilang
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
# Supplier Backend URL'ni belgilang
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
# Browser'da quyidagi linklarni ochib ko'ring:
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

## 📁 QADAM 7: VPS'da Project Directory'ga O'tish

```bash
# Project directory'ga o'ting
cd ~/clinic-erp-project

# Git pull qiling (agar repository'da o'zgarishlar bo'lsa)
git pull origin main
```

---

## 📝 QADAM 8: VPS'da .env Fayllarni Yangilash

### 8.1. SCP orqali Local Mashinadan Yuklash (Tavsiya etiladi)

**Local mashinadan (yangi terminal oching):**

```bash
# Local mashinada project directory'ga o'ting
cd /Users/Development/Desktop/Clinic_ERP_Project

# VPS IP'ni belgilang
export VPS_IP="your-vps-ip"
export VPS_USER="user"  # yoki "root"

# .env fayllarni VPS'ga yuklash
scp apps/backend/.env ${VPS_USER}@${VPS_IP}:~/clinic-erp-project/apps/backend/.env
scp apps/frontend/.env.local ${VPS_USER}@${VPS_IP}:~/clinic-erp-project/apps/frontend/.env.local
scp apps/supplier-backend/.env ${VPS_USER}@${VPS_IP}:~/clinic-erp-project/apps/supplier-backend/.env
scp apps/supplier-frontend/.env.local ${VPS_USER}@${VPS_IP}:~/clinic-erp-project/apps/supplier-frontend/.env.local
```

### 8.2. Yoki VPS'da To'g'ridan-To'g'ri Tahrirlash

**VPS'da (SSH orqali kirgan terminalingizda):**

```bash
# Clinic Backend .env
nano ~/clinic-erp-project/apps/backend/.env
# O'zgarishlarni qo'shing va saqlang (Ctrl+X, Y, Enter)

# Clinic Frontend .env.local
nano ~/clinic-erp-project/apps/frontend/.env.local
# O'zgarishlarni qo'shing va saqlang

# Supplier Backend .env
nano ~/clinic-erp-project/apps/supplier-backend/.env
# O'zgarishlarni qo'shing va saqlang

# Supplier Frontend .env.local
nano ~/clinic-erp-project/apps/supplier-frontend/.env.local
# O'zgarishlarni qo'shing va saqlang
```

---

## 📥 QADAM 9: VPS'da Yangi Image'larni Pull Qilish

```bash
# VPS'da project directory'ga o'ting
cd ~/clinic-erp-project

# Docker Hub'dan barcha yangi image'larni pull qilish
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest
docker pull findbeauty/supplier-backend:latest
docker pull findbeauty/supplier-frontend:latest
```

**⏱️ Pull vaqti:** Har bir image uchun 2-5 daqiqa

---

## 🚀 QADAM 10: Container'larni Yangilash va Ishga Tushirish

### 10.1. Eski Container'larni To'xtatish

```bash
# docker-compose orqali to'xtatish (tavsiya etiladi)
cd ~/clinic-erp-project
docker compose -f docker-compose.prod.yml down

# Yoki alohida to'xtatish
docker stop clinic-erp-backend-prod clinic-erp-frontend-prod supplier-erp-backend-prod supplier-erp-frontend-prod 2>/dev/null
docker rm clinic-erp-backend-prod clinic-erp-frontend-prod supplier-erp-backend-prod supplier-erp-frontend-prod 2>/dev/null
```
docker stop clinic-erp-frontend-prod 2>/dev/null

docker rm clinic-erp-frontend-prod 2>/dev/null
### 10.2. Yangi Container'larni Ishga Tushirish

```bash
# docker-compose.prod.yml fayl mavjudligini tekshirish
ls -la ~/clinic-erp-project/docker compose.prod.yml

# Barcha container'larni yangi image'lar bilan ishga tushirish
cd ~/clinic-erp-project
docker compose -f docker-compose.prod.yml up -d --force-recreate

# Container'lar holatini tekshirish
docker compose -f docker-compose.prod.yml ps
```

---

## 📊 QADAM 11: Log'larni Tekshirish

```bash
# Barcha log'larni ko'rish
docker compose -f docker-compose.prod.yml logs -f

# Yoki alohida log'lar
docker logs -f clinic-erp-backend-prod
docker logs -f clinic-erp-frontend-prod
docker logs -f supplier-erp-backend-prod
docker logs -f supplier-erp-frontend-prod
```

**Ctrl+C** bilan chiqish.

---

## ✅ QADAM 12: Servislarni Test Qilish

### 12.1. Backend Servislarni Tekshirish

```bash
# Clinic Backend (Port 3000)
curl http://localhost:3000/docs
# yoki browser'da: http://YOUR_VPS_IP:3000/docs

# Supplier Backend (Port 3002)
cu dfrl http://localhost:3002/docs
# yoki browser'da: http://YOUR_VPS_IP:3002/docs
```

### 12.2. Frontend Servislarni Tekshirish

```bash
# Browser'da ochib ko'ring:
# - Clinic Frontend: http://YOUR_VPS_IP:3001
# - Supplier Frontend: http://YOUR_VPS_IP:3003
```

---

## 📋 Deployment Checklist

- [ ] Git'ga push qilindi
- [ ] Docker Hub'ga login qilindi
- [ ] Buildx tayyorlandi
- [ ] Clinic Backend image build va push qilindi
- [ ] Clinic Frontend image build va push qilindi
- [ ] Supplier Backend image build va push qilindi
- [ ] Supplier Frontend image build va push qilindi
- [ ] VPS'ga SSH orqali kirildi
- [ ] Project directory'ga o'tildi
- [ ] Barcha .env fayllar yangilandi (SCP yoki nano orqali)
- [ ] Yangi image'lar pull qilindi
- [ ] Container'lar yangilandi va qayta ishga tushirildi
- [ ] Log'lar tekshirildi
- [ ] Barcha servislar ishlayapti va test qilindi

---

## 🎉 Tugadi!

Endi barcha 4 ta servis yangi o'zgarishlar bilan VPS'da ishlayapti:

- ✅ Clinic Backend: `http://YOUR_VPS_IP:3000`
- ✅ Clinic Frontend: `http://YOUR_VPS_IP:3001`
- ✅ Supplier Backend: `http://YOUR_VPS_IP:3002`
- ✅ Supplier Frontend: `http://YOUR_VPS_IP:3003`

**Muvaffaqiyatli deployment! 🚀**

---

## 🛠️ Tezkor Troubleshooting

### Agar Container ishlamayapti:

```bash
# Log'larni tekshirish
docker logs clinic-erp-backend-prod
docker logs clinic-erp-frontend-prod
docker logs supplier-erp-backend-prod
docker logs supplier-erp-frontend-prod

# Container'ni qayta ishga tushirish
docker restart clinic-erp-backend-prod
```

### Agar .env fayl topilmayapti:

```bash
# .env fayl mavjudligini tekshirish
ls -la ~/clinic-erp-project/apps/backend/.env
ls -la ~/clinic-erp-project/apps/frontend/.env.local
ls -la ~/clinic-erp-project/apps/supplier-backend/.env
ls -la ~/clinic-erp-project/apps/supplier-frontend/.env.local
```

### Agar Port allaqachon band:

```bash
# Port'ni ishlatayotgan process'ni topish
sudo lsof -i :3000
sudo lsof -i :3001
sudo lsof -i :3002
sudo lsof -i :3003

# Process'ni to'xtatish
sudo kill -9 PID
```
