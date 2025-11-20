# Docker Hub va VPS Deployment Qo'llanmasi

Bu qo'llanma Docker Hub'ga image'larni push qilish va VPS'da yangilash jarayonini tushuntradi.

## 📋 Talablar

- Docker va Docker Compose o'rnatilgan bo'lishi kerak
- Docker Hub account (https://hub.docker.com)
- VPS server (SSH orqali kirish imkoniyati)
- Git repository

---

## 🔐 1. Docker Hub'ga Login Qilish

### Local mashinada:

```bash
# Docker Hub'ga login qiling
docker login

# Username va password kiriting
# Username: findbeauty (yoki sizning username'ingiz)
# Password: [Docker Hub parolingiz]
```

---

## 🏗️ 2. Image'larni Build Qilish

### Backend Image Build:

**⚠️ MUHIM: Multi-platform build qilish kerak (VPS linux/amd64 architecture'da ishlaydi)**

```bash
# Project root directory'da
cd /Users/Development/Desktop/Clinic\ ERP\ project

# Docker buildx'ni faollashtirish (bir marta)
docker buildx create --use --name multiarch-builder || docker buildx use multiarch-builder

# Backend image'ni multi-platform build qilish (linux/amd64 uchun)
docker buildx build \
  --platform linux/amd64 \
  -f apps/backend/Dockerfile \
  -t findbeauty/clinic-backend:latest \
  --push .

# Yoki faqat local build (push qilmasdan):
docker buildx build \
  --platform linux/amd64 \
  -f apps/backend/Dockerfile \
  -t findbeauty/clinic-backend:latest \
  --load .
```

### Frontend Image Build:

**⚠️ MUHIM: Multi-platform build qilish kerak**

```bash
# Frontend image'ni multi-platform build qilish
# NEXT_PUBLIC_API_URL ni build vaqtida berish kerak
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com \
  -f apps/frontend/Dockerfile \
  -t findbeauty/clinic-frontend:latest \
  --push .

# Yoki faqat local build (push qilmasdan):
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com \
  -f apps/frontend/Dockerfile \
  -t findbeauty/clinic-frontend:latest \
  --load .
```

**Eslatma:** `--push` flag'i bilan to'g'ridan-to'g'ri Docker Hub'ga push qiladi. Agar avval local'da test qilmoqchi bo'lsangiz, `--load` ishlating.

**Eslatma:** `NEXT_PUBLIC_API_URL` backend API URL'ini ko'rsatishi kerak (masalan: `https://api.yourdomain.com` yoki `http://your-vps-ip:3000`)

---

## 📤 3. Docker Hub'ga Push Qilish

### Backend Image Push:

```bash
# Latest versiyani push qilish
docker push findbeauty/clinic-backend:latest

# Yoki versiya bilan:
docker push findbeauty/clinic-backend:v1.0.0
```

### Frontend Image Push:

```bash
# Latest versiyani push qilish
docker push findbeauty/clinic-frontend:latest

# Yoki versiya bilan:
docker push findbeauty/clinic-frontend:v1.0.0
```

---

## 🚀 4. VPS'da Yangilash

### SSH orqali VPS'ga kirish:

```bash
ssh user@your-vps-ip
# yoki
ssh user@your-domain.com
```

### VPS'da yangilash jarayoni:

```bash
# 1. Project directory'ga o'ting (agar mavjud bo'lsa)
cd /path/to/clinic-erp-project

# 2. Docker Hub'dan yangi image'larni pull qiling
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest

# 3. Eski container'larni to'xtatish va o'chirish
docker-compose -f docker-compose.prod.yml down

# 4. Yangi image'lar bilan container'larni ishga tushirish
docker-compose -f docker-compose.prod.yml up -d

# 5. Container'lar holatini tekshirish
docker-compose -f docker-compose.prod.yml ps

# 6. Log'larni ko'rish (agar kerak bo'lsa)
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 📝 5. To'liq Deployment Script (VPS'da)

VPS'da quyidagi script'ni yaratib, bitta buyruq bilan yangilash mumkin:

```bash
# VPS'da yangilash script'i yaratish
nano ~/update-clinic-erp.sh
```

Script mazmuni:

```bash
#!/bin/bash

echo "🚀 Clinic ERP yangilash jarayoni boshlandi..."

# Docker Hub'dan yangi image'larni pull qilish
echo "📥 Yangi image'lar yuklanmoqda..."
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest

# Eski container'larni to'xtatish
echo "⏹️  Eski container'lar to'xtatilmoqda..."
docker-compose -f /path/to/clinic-erp-project/docker-compose.prod.yml down

# Yangi container'larni ishga tushirish
echo "▶️  Yangi container'lar ishga tushirilmoqda..."
docker-compose -f /path/to/clinic-erp-project/docker-compose.prod.yml up -d

# Container'lar holatini ko'rsatish
echo "✅ Container'lar holati:"
docker-compose -f /path/to/clinic-erp-project/docker-compose.prod.yml ps

echo "🎉 Yangilash muvaffaqiyatli yakunlandi!"
```

Script'ni executable qilish:

```bash
chmod +x ~/update-clinic-erp.sh
```

Ishlatish:

```bash
~/update-clinic-erp.sh
```

---

## 🔄 6. Avtomatik Yangilash (CI/CD)

### GitHub Actions yoki boshqa CI/CD orqali:

`.github/workflows/deploy.yml` faylini yaratish:

```yaml
name: Build and Deploy

on:
  push:
    branches:
      - main

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      
      - name: Build and push backend
        uses: docker/build-push-action@v4
        with:
          context: .
          file: ./apps/backend/Dockerfile
          push: true
          tags: findbeauty/clinic-backend:latest
      
      - name: Build and push frontend
        uses: docker/build-push-action@v4
        with:
          context: .
          file: ./apps/frontend/Dockerfile
          push: true
          tags: findbeauty/clinic-frontend:latest
          build-args: |
            NEXT_PUBLIC_API_URL=${{ secrets.NEXT_PUBLIC_API_URL }}
      
      - name: Deploy to VPS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /path/to/clinic-erp-project
            docker pull findbeauty/clinic-backend:latest
            docker pull findbeauty/clinic-frontend:latest
            docker-compose -f docker-compose.prod.yml down
            docker-compose -f docker-compose.prod.yml up -d
```

---

## 🛠️ 7. Troubleshooting

### Image pull qilishda xatolik:

```bash
# Docker Hub'ga login qilinganligini tekshiring
docker login

# Image'lar mavjudligini tekshiring
docker search findbeauty/clinic-backend
```

### Container ishlamayapti:

```bash
# Log'larni ko'rish
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs frontend

# Container'lar holatini tekshirish
docker ps -a

# Container'ni qayta ishga tushirish
docker-compose -f docker-compose.prod.yml restart backend
docker-compose -f docker-compose.prod.yml restart frontend
```

### Database migration muammosi:

```bash
# Backend container'ga kirish
docker exec -it clinic-erp-backend-prod sh

# Migration'larni ishga tushirish
cd /app/apps/backend
npx prisma migrate deploy
```

### Eski image'larni tozalash:

```bash
# Ishlatilmayotgan image'larni o'chirish
docker image prune -a

# Yoki bitta image'ni o'chirish
docker rmi findbeauty/clinic-backend:old-version
```

---

## 📋 8. Checklist

Deployment oldidan tekshirish:

- [ ] Local'da image'lar to'g'ri build bo'ldimi?
- [ ] Docker Hub'ga login qildingizmi?
- [ ] Image'lar Docker Hub'ga push qilindi?
- [ ] VPS'da `.env` fayllari to'g'ri sozlanganmi?
- [ ] VPS'da port'lar ochiqmi? (3000, 3001)
- [ ] Database connection to'g'rimi?
- [ ] `NEXT_PUBLIC_API_URL` to'g'ri sozlanganmi?

---

## 🔐 9. Xavfsizlik Maslahatlari

1. **Environment Variables**: `.env` fayllarni Git'ga commit qilmang
2. **Docker Hub Password**: Strong password ishlating
3. **SSH Keys**: Password o'rniga SSH key ishlating
4. **Firewall**: Faqat kerakli port'larni oching
5. **Updates**: Muntazam ravishda image'larni yangilang

---

## 📞 10. Foydali Buyruqlar

```bash
# Image'larni ko'rish
docker images | grep clinic

# Container'larni ko'rish
docker ps -a | grep clinic

# Log'larni real-time ko'rish
docker-compose -f docker-compose.prod.yml logs -f

# Container'ni qayta ishga tushirish
docker-compose -f docker-compose.prod.yml restart [service-name]

# Container'ni to'xtatish
docker-compose -f docker-compose.prod.yml stop [service-name]

# Container'ni o'chirish
docker-compose -f docker-compose.prod.yml rm [service-name]

# System resource'larni ko'rish
docker stats
```

---

## 🎯 Tez Reference

### Local Build va Push (Multi-platform):

```bash
# Buildx'ni faollashtirish (bir marta)
docker buildx create --use --name multiarch-builder || docker buildx use multiarch-builder

# Backend
docker buildx build \
  --platform linux/amd64 \
  -f apps/backend/Dockerfile \
  -t findbeauty/clinic-backend:latest \
  --push .

# Frontend
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com \
  -f apps/frontend/Dockerfile \
  -t findbeauty/clinic-frontend:latest \
  --push .
```

### Agar buildx ishlamasa (Eski usul - faqat local platform):

```bash
# Backend
docker build -f apps/backend/Dockerfile -t findbeauty/clinic-backend:latest .
docker push findbeauty/clinic-backend:latest

# Frontend
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com -f apps/frontend/Dockerfile -t findbeauty/clinic-frontend:latest .
docker push findbeauty/clinic-frontend:latest
```

### VPS'da Yangilash:

```bash
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

---

**Eslatma:** `findbeauty` o'rniga o'zingizning Docker Hub username'ingizni qo'ying.

