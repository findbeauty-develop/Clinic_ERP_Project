# VPS'da Deploy Qilish Qo'llanmasi

## 1. VPS'ga Tayyorgarlik

### Kerakli dasturlar:
```bash
# Docker o'rnatish (agar yo'q bo'lsa)
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Docker Compose o'rnatish (agar yo'q bo'lsa)
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## 2. Project Papkasini Yaratish

```bash
# Project papkasini yaratish
mkdir -p ~/clinic-erp
cd ~/clinic-erp
```

## 3. Environment Variable Fayllarni Yaratish

### Backend .env fayl:
```bash
nano apps/backend/.env
```

Quyidagi o'zgaruvchilarni qo'shing:
```env
SUPABASE_URL=https://vpzhvfawmpkgtwwlnrik.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
DATABASE_URL=your_database_url_here
PORT=3000
NODE_ENV=production
```

### Frontend .env.local fayl (agar kerak bo'lsa):
```bash
mkdir -p apps/frontend
nano apps/frontend/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://your-vps-ip:3000
# yoki domain bo'lsa:
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

## 4. Docker Compose Faylini Ko'chirish

`docker-compose.prod.yml` faylini VPS'ga ko'chiring (scp yoki git orqali).

## 5. Image'larni Pull Qilish

```bash
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest  # agar frontend ham bo'lsa
```

## 6. Konteynerlarni Ishga Tushirish

### Variant 1: Docker Compose bilan (tavsiya etiladi)
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Variant 2: Docker Run bilan
```bash
# Backend
docker run -d \
  --name clinic-erp-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file apps/backend/.env \
  findbeauty/clinic-backend:latest

# Frontend (agar kerak bo'lsa)
docker run -d \
  --name clinic-erp-frontend \
  --restart unless-stopped \
  -p 3001:3001 \
  --env-file apps/frontend/.env.local \
  -e NEXT_PUBLIC_API_URL=http://your-vps-ip:3000 \
  findbeauty/clinic-frontend:latest
```

## 7. Statusni Tekshirish

```bash
# Konteynerlarni ko'rish
docker ps

# Loglarni ko'rish
docker logs clinic-erp-backend-prod
docker logs clinic-erp-frontend-prod  # agar frontend bo'lsa

# Real-time loglar
docker logs -f clinic-erp-backend-prod
```

## 8. Yangilash

Yangi versiyani olish uchun:
```bash
# Image'larni yangilash
docker pull findbeauty/clinic-backend:latest

# Konteynerlarni qayta ishga tushirish
docker-compose -f docker-compose.prod.yml up -d --force-recreate backend
```

## 9. Nginx Reverse Proxy (Ixtiyoriy)

Agar domain va SSL kerak bo'lsa:

```nginx
# /etc/nginx/sites-available/clinic-erp
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 10. Xavfsizlik

- `.env` fayllarni faqat VPS'da saqlang, Git'ga commit qilmang
- Firewall sozlang:
  ```bash
  sudo ufw allow 3000/tcp
  sudo ufw allow 3001/tcp
  sudo ufw enable
  ```

## Muammolarni Hal Qilish

### Environment variable xatosi:
```bash
# Konteyner ichida tekshirish
docker exec clinic-erp-backend-prod env | grep SUPABASE
```

### Loglarni tozalash:
```bash
docker logs --tail 100 clinic-erp-backend-prod
```

### Konteynerni qayta ishga tushirish:
```bash
docker restart clinic-erp-backend-prod
```

