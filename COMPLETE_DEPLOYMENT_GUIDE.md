# 🚀 To'liq Deployment Qo'llanmasi - Boshidan Oxirigacha

Bu qo'llanma sizga **yangi local mashinadan** Docker Hub va VPS'ga boshidan oxirigacha deploy qilishni ko'rsatadi.

---

## 📋 Kerakli Ma'lumotlar

Deploy qilishdan oldin quyidagilarni tayyorlang:

- ✅ Docker Hub account (username: `findbeauty`)
- ✅ Docker Hub password yoki access token
- ✅ VPS IP manzili yoki domain
- ✅ VPS'ga SSH kirish (username va password yoki SSH key)
- ✅ Supabase URL va Service Role Key
- ✅ Database URL (Supabase connection string)
- ✅ Git repository access (agar kerak bo'lsa)

---

## 🖥️ QADAM 1: Local Mashinada Tayyorgarlik

### 1.1. Docker Desktop O'rnatish

**macOS uchun:**

```bash
# Homebrew orqali o'rnatish (tavsiya etiladi)
brew install --cask docker

# Yoki Docker Desktop'ni rasmiy saytdan yuklab oling:
# https://www.docker.com/products/docker-desktop
```

**Docker Desktop'ni ishga tushiring va quyidagilarni tekshiring:**

```bash
# Docker versiyasini tekshirish
docker --version

# Docker Compose versiyasini tekshirish
docker compose version

# Docker ishlayotganini tekshirish
docker ps
```

### 1.2. Docker Hub'ga Login Qilish

```bash
# Docker Hub'ga login qilish
docker login

# Username: findbeauty
# Password: (Docker Hub parolingiz)
```

**Yoki access token ishlatsangiz:**

```bash
echo "YOUR_DOCKER_HUB_TOKEN" | docker login --username findbeauty --password-stdin
```

### 1.3. Project'ni Clone Qilish (Agar Git'dan olsangiz)

```bash
# Project papkasiga o'tish
cd ~/Desktop

# Git repository'ni clone qilish (agar kerak bo'lsa)
# git clone <repository-url> "Clinic ERP project"
```

### 1.4. Project Papkasiga O'tish

```bash
cd ~/Desktop/"Clinic ERP project"
pwd
# Natija: /Users/Development/Desktop/Clinic ERP project
```

---

## 🏗️ QADAM 2: Backend Image'ni Build Qilish

### 2.1. Backend Image'ni Build Qilish

```bash
# Project root papkasida
cd ~/Desktop/"Clinic ERP project"

# Backend image'ni build qilish
docker build \
  -t findbeauty/clinic-backend:latest \
  -t findbeauty/clinic-backend:$(date +%Y%m%d-%H%M%S) \
  -f apps/backend/Dockerfile \
  .
```

**Build jarayoni 5-10 daqiqa davom etishi mumkin.**

### 2.2. Build Muvaffaqiyatli Bo'lganini Tekshirish

```bash
# Image'lar ro'yxatini ko'rish
docker images | grep clinic-backend

# Natija quyidagicha bo'lishi kerak:
# findbeauty/clinic-backend   latest    ...    ...    ...
# findbeauty/clinic-backend   20250114-123456  ...    ...    ...
```

---

## 📤 QADAM 3: Backend Image'ni Docker Hub'ga Push Qilish

### 3.1. Image'ni Push Qilish

```bash
# Latest tag'ni push qilish
docker push findbeauty/clinic-backend:latest

# Version tag'ni ham push qilish (ixtiyoriy)
docker push findbeauty/clinic-backend:$(date +%Y%m%d-%H%M%S)
```

**Push jarayoni internet tezligiga qarab 5-15 daqiqa davom etishi mumkin.**

### 3.2. Docker Hub'da Tekshirish

Docker Hub'ga kirib (`https://hub.docker.com/r/findbeauty/clinic-backend`), image push qilinganini tekshiring.

---

## 🎨 QADAM 4: Frontend Image'ni Build Qilish

### 4.1. Backend URL'ni Aniqlash

Frontend build qilishdan oldin, backend URL'ni aniqlang:

- **Agar VPS'da backend ishlayotgan bo'lsa:** `http://YOUR_VPS_IP:3000` yoki `https://api.yourdomain.com`
- **Agar hali deploy qilmagan bo'lsa:** VPS IP'ni oldindan aniqlang

**Muhim:** Frontend build qilishda `NEXT_PUBLIC_API_URL` environment variable kerak.

### 4.2. Frontend Image'ni Build Qilish

```bash
# Project root papkasida
cd ~/Desktop/"Clinic ERP project"

# VPS IP'ni o'zgartiring
export VPS_IP="YOUR_VPS_IP"  # Masalan: 123.45.67.89
export BACKEND_URL="http://${VPS_IP}:3000"

# Frontend image'ni build qilish
docker build \
  --build-arg NEXT_PUBLIC_API_URL=${BACKEND_URL} \
  -t findbeauty/clinic-frontend:latest \
  -t findbeauty/clinic-frontend:$(date +%Y%m%d-%H%M%S) \
  -f apps/frontend/Dockerfile \
  .
```

**Yoki agar domain ishlatsangiz:**

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com \
  -t findbeauty/clinic-frontend:latest \
  -t findbeauty/clinic-frontend:$(date +%Y%m%d-%H%M%S) \
  -f apps/frontend/Dockerfile \
  .
```

### 4.3. Build Muvaffaqiyatli Bo'lganini Tekshirish

```bash
# Image'lar ro'yxatini ko'rish
docker images | grep clinic-frontend
```

---

## 📤 QADAM 5: Frontend Image'ni Docker Hub'ga Push Qilish

```bash
# Latest tag'ni push qilish
docker push findbeauty/clinic-frontend:latest

# Version tag'ni ham push qilish (ixtiyoriy)
docker push findbeauty/clinic-frontend:$(date +%Y%m%d-%H%M%S)
```

---

## 🖥️ QADAM 6: VPS'ga Kirish va Tayyorgarlik

### 6.1. VPS'ga SSH orqali Kirish

```bash
# SSH orqali kirish
ssh root@YOUR_VPS_IP
# yoki
ssh username@YOUR_VPS_IP

# SSH key ishlatsangiz
ssh -i ~/.ssh/your-key.pem root@YOUR_VPS_IP
```

### 6.2. Docker va Docker Compose O'rnatish (Agar Yo'q Bo'lsa)

```bash
# Docker o'rnatish
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Docker Compose o'rnatish
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Docker service'ni ishga tushirish
sudo systemctl start docker
sudo systemctl enable docker

# Tekshirish
docker --version
docker compose version
```

### 6.3. Docker Hub'ga Login Qilish (VPS'da)

```bash
# Docker Hub'ga login qilish
docker login

# Username: findbeauty
# Password: (Docker Hub parolingiz)
```

---

## 📁 QADAM 7: VPS'da Project Papkasini Yaratish

```bash
# Project papkasini yaratish
mkdir -p ~/clinic-erp/apps/backend
mkdir -p ~/clinic-erp/apps/frontend
cd ~/clinic-erp
```

---

## 🔐 QADAM 8: Environment Variable Fayllarni Yaratish

### 8.1. Backend .env Faylini Yaratish

```bash
nano ~/clinic-erp/apps/backend/.env
```

**Quyidagi o'zgaruvchilarni qo'shing (o'z qiymatlaringiz bilan):**

```env
# Supabase Configuration
SUPABASE_URL=https://vpzhvfawmpkgtwwlnrik.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here

# Database Configuration
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres?pgbouncer=true

# JWT Configuration
MEMBER_JWT_SECRET=your_member_jwt_secret_here
MEMBER_JWT_EXPIRES_IN=7d

# Server Configuration
PORT=3000
NODE_ENV=production

# CORS (agar kerak bo'lsa)
CORS_ORIGIN=http://YOUR_VPS_IP:3001,https://yourdomain.com
```

**Faylni saqlash:**
- `Ctrl + O` (saqlash)
- `Enter` (tasdiqlash)
- `Ctrl + X` (chiqish)

### 8.2. Frontend .env.local Faylini Yaratish

```bash
nano ~/clinic-erp/apps/frontend/.env.local
```

**Quyidagi o'zgaruvchilarni qo'shing:**

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://YOUR_VPS_IP:3000
# yoki agar domain bo'lsa:
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Production environment
NODE_ENV=production
```

**Faylni saqlash:**
- `Ctrl + O` (saqlash)
- `Enter` (tasdiqlash)
- `Ctrl + X` (chiqish)

---

## 📥 QADAM 9: Docker Hub'dan Image'larni Pull Qilish

```bash
# Backend image'ni pull qilish
docker pull findbeauty/clinic-backend:latest

# Frontend image'ni pull qilish
docker pull findbeauty/clinic-frontend:latest

# Image'lar pull qilinganini tekshirish
docker images | grep clinic
```

---

## 🐳 QADAM 10: Docker Compose Faylini Yaratish

### 10.1. docker-compose.prod.yml Faylini Yaratish

```bash
nano ~/clinic-erp/docker-compose.prod.yml
```

**Quyidagi kontentni qo'shing:**

```yaml
version: '3.8'

services:
  backend:
    image: findbeauty/clinic-backend:latest
    container_name: clinic-erp-backend-prod
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - ./apps/backend/.env
    volumes:
      - ./apps/backend/uploads:/app/apps/backend/uploads
    networks:
      - clinic-erp-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  frontend:
    image: findbeauty/clinic-frontend:latest
    container_name: clinic-erp-frontend-prod
    restart: unless-stopped
    ports:
      - "3001:3001"
    env_file:
      - ./apps/frontend/.env.local
    environment:
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:3000}
    depends_on:
      - backend
    networks:
      - clinic-erp-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  clinic-erp-network:
    driver: bridge
```

**Faylni saqlash:**
- `Ctrl + O` (saqlash)
- `Enter` (tasdiqlash)
- `Ctrl + X` (chiqish)

### 10.2. Uploads Papkasini Yaratish

```bash
# Backend uploads papkasini yaratish
mkdir -p ~/clinic-erp/apps/backend/uploads

# Ruxsat berish
chmod -R 755 ~/clinic-erp/apps/backend/uploads
```

---

## 🚀 QADAM 11: Konteynerlarni Ishga Tushirish

### 11.1. Docker Compose orqali Ishga Tushirish

```bash
cd ~/clinic-erp

# Konteynerlarni ishga tushirish
docker compose -f docker-compose.prod.yml up -d

# Statusni tekshirish
docker compose -f docker-compose.prod.yml ps
```

### 11.2. Loglarni Tekshirish

```bash
# Backend loglarini ko'rish
docker logs -f clinic-erp-backend-prod

# Frontend loglarini ko'rish
docker logs -f clinic-erp-frontend-prod

# Barcha loglarni ko'rish
docker compose -f docker-compose.prod.yml logs -f
```

**Ctrl + C** bilan loglardan chiqish.

---

## ✅ QADAM 12: Ishga Tushganini Tekshirish

### 12.1. Konteynerlarni Tekshirish

```bash
# Barcha konteynerlarni ko'rish
docker ps

# Health check natijalarini ko'rish
docker compose -f docker-compose.prod.yml ps
```

### 12.2. API'ni Tekshirish

**Backend'ni tekshirish:**

```bash
# VPS'da
curl http://localhost:3000/health

# Yoki browser'da
# http://YOUR_VPS_IP:3000/health
```

**Frontend'ni tekshirish:**

```bash
# VPS'da
curl http://localhost:3001

# Yoki browser'da
# http://YOUR_VPS_IP:3001
```

### 12.3. Database Migration'ni Ishlatish

```bash
# Backend konteyneriga kirish
docker exec -it clinic-erp-backend-prod sh

# Migration'larni ishga tushirish
cd /app/apps/backend
pnpm exec prisma migrate deploy

# Yoki agar prisma yo'q bo'lsa
npx prisma migrate deploy

# Chiqish
exit
```

---

## 🔄 QADAM 13: Yangilash (Update)

Yangi versiyani deploy qilish uchun:

### 13.1. Local Mashinada

```bash
# 1. Image'larni qayta build qilish
cd ~/Desktop/"Clinic ERP project"

# Backend
docker build -t findbeauty/clinic-backend:latest -f apps/backend/Dockerfile .

# Frontend
docker build --build-arg NEXT_PUBLIC_API_URL=http://YOUR_VPS_IP:3000 -t findbeauty/clinic-frontend:latest -f apps/frontend/Dockerfile .

# 2. Docker Hub'ga push qilish
docker push findbeauty/clinic-backend:latest
docker push findbeauty/clinic-frontend:latest
```

### 13.2. VPS'da

```bash
# 1. Image'larni pull qilish
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest

# 2. Konteynerlarni qayta ishga tushirish
cd ~/clinic-erp
docker compose -f docker-compose.prod.yml up -d --force-recreate

# 3. Statusni tekshirish
docker compose -f docker-compose.prod.yml ps
```

---

## 🔧 QADAM 14: Muammolarni Hal Qilish

### 14.1. Konteyner Ishlayotganini Tekshirish

```bash
# Barcha konteynerlarni ko'rish (ishlayotgan va to'xtagan)
docker ps -a

# Konteyner loglarini ko'rish
docker logs clinic-erp-backend-prod
docker logs clinic-erp-frontend-prod
```

### 14.2. Environment Variable'larni Tekshirish

```bash
# Backend konteynerida
docker exec clinic-erp-backend-prod env | grep SUPABASE

# Frontend konteynerida
docker exec clinic-erp-frontend-prod env | grep NEXT_PUBLIC
```

### 14.3. Konteynerni Qayta Ishga Tushirish

```bash
# Bitta konteynerni qayta ishga tushirish
docker restart clinic-erp-backend-prod

# Yoki docker compose orqali
docker compose -f docker-compose.prod.yml restart backend
```

### 14.4. Konteynerni Tozalash va Qayta Yaratish

```bash
# Konteynerlarni to'xtatish va o'chirish
docker compose -f docker-compose.prod.yml down

# Qayta yaratish
docker compose -f docker-compose.prod.yml up -d
```

### 14.5. Database Connection Xatosi

```bash
# Database URL'ni tekshirish
docker exec clinic-erp-backend-prod env | grep DATABASE_URL

# Prisma client'ni generate qilish
docker exec -it clinic-erp-backend-prod sh
cd /app/apps/backend
npx prisma generate
exit
```

### 14.6. Port Band Bo'lgan Xatosi

```bash
# Port'ni ishlatayotgan process'ni topish
sudo lsof -i :3000
sudo lsof -i :3001

# Process'ni o'chirish
sudo kill -9 <PID>
```

---

## 🔒 QADAM 15: Xavfsizlik Sozlash

### 15.1. Firewall Sozlash

```bash
# UFW firewall o'rnatish (agar yo'q bo'lsa)
sudo apt update
sudo apt install ufw

# Kerakli port'larni ochish
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 3000/tcp  # Backend
sudo ufw allow 3001/tcp  # Frontend
sudo ufw allow 80/tcp    # HTTP (agar Nginx ishlatsangiz)
sudo ufw allow 443/tcp   # HTTPS (agar SSL ishlatsangiz)

# Firewall'ni ishga tushirish
sudo ufw enable

# Statusni tekshirish
sudo ufw status
```

### 15.2. .env Fayllarni Himoya Qilish

```bash
# .env fayllarga ruxsat berish
chmod 600 ~/clinic-erp/apps/backend/.env
chmod 600 ~/clinic-erp/apps/frontend/.env.local

# .gitignore'ga qo'shish (agar Git ishlatsangiz)
echo ".env" >> ~/clinic-erp/.gitignore
echo ".env.local" >> ~/clinic-erp/.gitignore
```

---

## 📊 QADAM 16: Monitoring va Loglar

### 16.1. Loglarni Ko'rish

```bash
# Real-time loglar
docker compose -f docker-compose.prod.yml logs -f

# Faqat backend loglari
docker logs -f clinic-erp-backend-prod --tail 100

# Faqat frontend loglari
docker logs -f clinic-erp-frontend-prod --tail 100
```

### 16.2. Resource Usage'ni Tekshirish

```bash
# Konteyner resource usage
docker stats

# Disk usage
docker system df
```

### 16.3. Loglarni Tozalash

```bash
# Eski loglarni tozalash
docker system prune -f

# Yoki faqat loglarni
docker compose -f docker-compose.prod.yml logs --tail 0
```

---

## 🌐 QADAM 17: Nginx Reverse Proxy (Ixtiyoriy)

Agar domain va SSL kerak bo'lsa:

### 17.1. Nginx O'rnatish

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

### 17.2. Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/clinic-erp
```

**Quyidagi kontentni qo'shing:**

```nginx
# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Symlink yaratish va Nginx'ni qayta ishga tushirish:**

```bash
sudo ln -s /etc/nginx/sites-available/clinic-erp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 17.3. SSL Certificate Olish

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com
```

---

## 📝 Xulosa

Deployment muvaffaqiyatli yakunlandi! Quyidagilarni tekshiring:

- ✅ Backend: `http://YOUR_VPS_IP:3000` yoki `https://api.yourdomain.com`
- ✅ Frontend: `http://YOUR_VPS_IP:3001` yoki `https://yourdomain.com`
- ✅ Database migration'lar ishlatilgan
- ✅ Loglar to'g'ri ishlayapti
- ✅ Health check'lar muvaffaqiyatli

**Foydali Buyruqlar:**

```bash
# Statusni ko'rish
docker compose -f docker-compose.prod.yml ps

# Loglarni ko'rish
docker compose -f docker-compose.prod.yml logs -f

# Qayta ishga tushirish
docker compose -f docker-compose.prod.yml restart

# To'xtatish
docker compose -f docker-compose.prod.yml stop

# Ishga tushirish
docker compose -f docker-compose.prod.yml start

# To'xtatish va o'chirish
docker compose -f docker-compose.prod.yml down
```

**Muammo bo'lsa, QADAM 14 (Muammolarni Hal Qilish) bo'limiga qarang.**

---

## 📞 Qo'shimcha Yordam

Agar muammo bo'lsa:
1. Loglarni tekshiring: `docker logs clinic-erp-backend-prod`
2. Environment variable'larni tekshiring: `docker exec clinic-erp-backend-prod env`
3. Konteyner statusini tekshiring: `docker ps -a`
4. Network'ni tekshiring: `docker network ls`

**Omad! 🚀**

