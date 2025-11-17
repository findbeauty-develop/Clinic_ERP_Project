# Frontend'ni VPS'da Deploy Qilish - To'liq Qo'llanma

Bu qo'llanma sizga VPS'da frontend'ni boshidan oxirigacha deploy qilishni ko'rsatadi.

---

## 📋 Kerakli Ma'lumotlar

Deploy qilishdan oldin quyidagi ma'lumotlarni tayyorlang:

- ✅ Backend allaqachon ishlayapti va mavjud
- ✅ Backend URL (masalan: `http://your-vps-ip:3000` yoki `https://api.yourdomain.com`)
- ✅ VPS IP manzili yoki domain
- ✅ VPS'ga SSH kirish

---

## 🚀 QADAM 1: VPS'ga Kirish

```bash
ssh root@your-vps-ip
# yoki
ssh username@your-vps-ip
```

---

## 📁 QADAM 2: Project Papkasini Yaratish

```bash
# Agar backend papkasi mavjud bo'lsa, shu papkada ishlaymiz
cd ~/clinic-erp

# Frontend papkasini yaratish
mkdir -p apps/frontend
```

---

## 🔐 QADAM 3: Environment Variable Faylini Yaratish

### Frontend .env.local faylini yaratish:

```bash
nano ~/clinic-erp/apps/frontend/.env.local
```

### .env.local fayliga quyidagilarni qo'shing:

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://your-vps-ip:3000
# yoki agar domain bo'lsa:
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com

# Production environment
NODE_ENV=production
```

**Muhim:**

- `NEXT_PUBLIC_API_URL` backend'ning to'liq URL'i bo'lishi kerak
- Agar backend `http://localhost:3000` da ishlayotgan bo'lsa, frontend konteyneridan backend'ga ulanish uchun `http://your-vps-ip:3000` yoki `http://clinic-erp-backend-prod:3000` (agar docker network ishlatsangiz) ishlatishingiz kerak

### Faylni saqlash:

- `Ctrl + O` (saqlash)
- `Enter` (tasdiqlash)
- `Ctrl + X` (chiqish)

### Faylni tekshirish:

```bash
cat ~/clinic-erp/apps/frontend/.env.local
```

---

## 📥 QADAM 4: Docker Hub'dan Image'ni Pull Qilish (Agar mavjud bo'lsa)

Agar frontend image Docker Hub'da mavjud bo'lsa:

```bash
# Docker Hub'ga login qilish (agar login qilmagan bo'lsangiz)
docker login
# Username: findbeauty
# Password: (Docker Hub parolingiz)

# Frontend image'ni pull qilish
docker pull findbeauty/clinic-frontend:latest

# Image pull qilinganini tekshirish
docker images | grep clinic-frontend
```

**Agar image Docker Hub'da yo'q bo'lsa, QADAM 5 ga o'ting (VPS'da build qilish).**

---

## 🔨 QADAM 5: VPS'da Image'ni Build Qilish

Agar Docker Hub'da image yo'q bo'lsa yoki x86_64 architecture uchun build qilish kerak bo'lsa:

```bash
# 1. Backend bilan bir xil papkaga kirish (agar allaqachon mavjud bo'lsa)
cd /tmp/Clinic_ERP_Project

# 2. Agar papka mavjud bo'lsa, yangi o'zgarishlarni pull qilish
git pull origin develop

# YOKI agar papka yo'q bo'lsa, yangi clone qilish:
# cd /tmp
# rm -rf Clinic_ERP_Project
# git clone https://github.com/findbeauty-develop/Clinic_ERP_Project.git
# cd Clinic_ERP_Project

# 3. Dockerfile mavjudligini tekshirish
ls -la apps/frontend/Dockerfile

# 4. Eski image'ni o'chirish (agar mavjud bo'lsa, disk joyini bo'shatish uchun)
docker rmi findbeauty/clinic-frontend:latest 2>/dev/null || true

# 5. Image'ni VPS architecture (x86_64) uchun build qilish
docker build -t findbeauty/clinic-frontend:latest -f apps/frontend/Dockerfile .

# 6. Build muvaffaqiyatli bo'lgandan keyin, image'ni tekshirish
docker images | grep clinic-frontend
```

**Build vaqt:** 5-10 daqiqa (dependencies o'rnatish va build qilish)

---

## 🚀 QADAM 6: Konteynerni Ishga Tushirish

### Variant A: Oddiy Docker Run (Tavsiya etiladi)

```bash
docker run -d \
  --name clinic-frontend \
  --restart unless-stopped \
  -p 3001:3001 \
  --env-file ~/clinic-erp/apps/frontend/.env.local \
  -e NODE_ENV=production \
  findbeauty/clinic-frontend:latest
```

**Parametrlar tushuntirishi:**

- `-d` - background'da ishlash
- `--name clinic-frontend` - konteyner nomi
- `--restart unless-stopped` - avtomatik qayta ishga tushish
- `-p 3001:3001` - port mapping (host:container)
- `--env-file` - environment variable fayl
- `-e NODE_ENV=production` - production environment

### Variant B: Docker Compose bilan

Agar `docker-compose.prod.yml` faylini ishlatmoqchi bo'lsangiz:

```bash
cd ~/clinic-erp
docker-compose -f docker-compose.prod.yml up -d frontend
```

**Eslatma:** `docker-compose.prod.yml` faylini VPS'ga ko'chirishingiz kerak.

---

## ✅ QADAM 7: Statusni Tekshirish

### Konteyner ishlayotganini ko'rish:

```bash
docker ps
```

**Natija:** `clinic-frontend` konteyneri `Up` holatida bo'lishi kerak

### Loglarni ko'rish:

```bash
# So'nggi 50 qator log
docker logs --tail 50 clinic-frontend

# Real-time loglar (Ctrl+C bilan to'xtatish)
docker logs -f clinic-frontend
```

**Muvaffaqiyatli ishga tushgan belgilar:**

- ✅ `Ready on http://0.0.0.0:3001`
- ✅ `started server on 0.0.0.0:3001`
- ❌ `ERROR` xatolar bo'lmasligi kerak

### Konteyner ichida test qilish:

```bash
# Konteyner ichida environment variable'larni tekshirish
docker exec clinic-frontend env | grep NEXT_PUBLIC

# Konteyner ichida frontend'ni test qilish
docker exec clinic-frontend wget -qO- http://localhost:3001
```

---

## 🔥 QADAM 8: Firewall Sozlash

### UFW (Ubuntu/Debian):

```bash
# Port 3001 ni ochish
sudo ufw allow 3001/tcp

# Firewall'ni yoqish (agar yo'q bo'lsa)
sudo ufw enable

# Statusni tekshirish
sudo ufw status
```

### Firewalld (CentOS/RHEL):

```bash
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

### iptables (boshqa distributivlar):

```bash
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
sudo iptables-save
```

---

## 🌐 QADAM 9: Test Qilish

### VPS ichida test:

```bash
# Localhost orqali test
curl http://localhost:3001

# yoki
curl http://localhost:3001/api/health
```

### Tashqaridan test (browser):

```
http://your-vps-ip:3001
```

**Muvaffaqiyatli natija:**

- Frontend sahifa yuklanishi kerak
- Backend API'ga ulanish ishlashi kerak

### Browser'da test qilish:

1. Browser'da `http://your-vps-ip:3001` ni oching
2. Frontend sahifa yuklanishi kerak
3. API so'rovlari backend'ga muvaffaqiyatli yuborilishi kerak

---

## 🔄 QADAM 10: Yangilash (Keyinchalik)

Yangi versiyani olish uchun:

```bash
# 1. Eski konteynerni to'xtatish va o'chirish
docker stop clinic-frontend
docker rm clinic-frontend

# 2. Yangi image'ni pull qilish (agar Docker Hub'da bo'lsa)
docker pull findbeauty/clinic-frontend:latest

# YOKI VPS'da qayta build qilish
cd /tmp/Clinic_ERP_Project
git pull origin develop
docker build -t findbeauty/clinic-frontend:latest -f apps/frontend/Dockerfile .

# 3. Yangi konteynerni ishga tushirish
docker run -d \
  --name clinic-frontend \
  --restart unless-stopped \
  -p 3001:3001 \
  --env-file ~/clinic-erp/apps/frontend/.env.local \
  -e NODE_ENV=production \
  findbeauty/clinic-frontend:latest

# 4. Statusni tekshirish
docker logs -f clinic-frontend
```

---

## 🛠️ Muammolarni Hal Qilish

### Muammo 1: Konteyner ishlamayapti

```bash
# Konteyner holatini ko'rish
docker ps -a

# Xato loglarini ko'rish
docker logs clinic-frontend

# Konteynerni qayta ishga tushirish
docker restart clinic-frontend
```

### Muammo 2: Environment variable xatosi

```bash
# .env.local faylni tekshirish
cat ~/clinic-erp/apps/frontend/.env.local

# Konteyner ichida environment variable'larni tekshirish
docker exec clinic-frontend env | grep NEXT_PUBLIC

# Agar xato bo'lsa, .env.local faylni to'g'rilang va konteynerni qayta ishga tushiring
docker restart clinic-frontend
```

### Muammo 3: Backend'ga ulanish ishlamayapti

```bash
# Backend konteyner ishlayotganini tekshirish
docker ps | grep clinic-backend

# Backend'ga ulanishni test qilish
curl http://localhost:3000/docs

# .env.local faylda NEXT_PUBLIC_API_URL to'g'ri ekanligini tekshirish
cat ~/clinic-erp/apps/frontend/.env.local

# Agar docker network ishlatsangiz, backend service nomini ishlatishingiz mumkin
# NEXT_PUBLIC_API_URL=http://clinic-erp-backend-prod:3000
```

### Muammo 4: Port ochilmagan

```bash
# Port 3001 ochilganini tekshirish
sudo netstat -tulpn | grep 3001
# yoki
sudo ss -tulpn | grep 3001

# Agar ochilmagan bo'lsa, firewall sozlang (QADAM 8 ga qarang)
```

### Muammo 5: Build xatosi

```bash
# Build loglarini batafsil ko'rish
docker build -t findbeauty/clinic-frontend:latest -f apps/frontend/Dockerfile . 2>&1 | tail -50

# Disk joyini tekshirish
df -h

# Docker cache'ni tozalash
docker system prune -a
```

### Muammo 6: Frontend yuklanmayapti yoki xato ko'rsatmoqda

```bash
# Browser console'da xatolarni ko'rish (F12)
# Network tab'da API so'rovlarini tekshirish

# Backend'ga ulanishni test qilish
curl http://your-vps-ip:3000/docs

# Frontend loglarini ko'rish
docker logs --tail 100 clinic-frontend
```

---

## 📊 QADAM 11: Monitoring va Loglar

### Loglarni ko'rish:

```bash
# Real-time loglar
docker logs -f clinic-frontend

# So'nggi 100 qator
docker logs --tail 100 clinic-frontend

# Muayyan vaqt oralig'idagi loglar
docker logs --since 1h clinic-frontend
```

### Konteyner statistikasi:

```bash
# Resurs ishlatilishini ko'rish
docker stats clinic-frontend

# Barcha konteynerlarni ko'rish
docker ps
```

### Disk joyini tekshirish:

```bash
# Docker disk ishlatilishini ko'rish
docker system df

# Eski image'larni tozalash (ixtiyoriy)
docker system prune -a
```

---

## 🔒 QADAM 12: Xavfsizlik

### .env.local fayl xavfsizligi:

```bash
# .env.local fayl ruxsatlarini cheklash
chmod 600 ~/clinic-erp/apps/frontend/.env.local

# Faqat owner o'qishi mumkin
ls -la ~/clinic-erp/apps/frontend/.env.local
```

### Firewall qoidalari:

```bash
# Faqat kerakli portlarni ochish
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 3000/tcp # Backend
sudo ufw allow 3001/tcp # Frontend
sudo ufw enable
```

---

## 📝 Qo'shimcha: Nginx Reverse Proxy (Ixtiyoriy)

Agar domain va SSL kerak bo'lsa:

### Nginx o'rnatish:

```bash
sudo apt update
sudo apt install nginx -y
```

### Nginx konfiguratsiyasi:

```bash
sudo nano /etc/nginx/sites-available/clinic-erp-frontend
```

Quyidagilarni qo'shing:

```nginx
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

### Nginx'ni ishga tushirish:

```bash
sudo ln -s /etc/nginx/sites-available/clinic-erp-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL sertifikat (Let's Encrypt):

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 🔗 Backend va Frontend'ni Birgalikda Ishlatish

### Docker Compose bilan (Tavsiya etiladi):

```bash
cd ~/clinic-erp

# docker-compose.prod.yml faylini yarating yoki ko'chiring
nano docker-compose.prod.yml
```

Quyidagi kontentni qo'shing:

```yaml
version: "3.8"

services:
  backend:
    image: findbeauty/clinic-backend:latest
    container_name: clinic-erp-backend-prod
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - ./apps/backend/.env
    networks:
      - clinic-erp-network

  frontend:
    image: findbeauty/clinic-frontend:latest
    container_name: clinic-erp-frontend-prod
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://your-vps-ip:3000
    env_file:
      - ./apps/frontend/.env.local
    depends_on:
      - backend
    networks:
      - clinic-erp-network

networks:
  clinic-erp-network:
    driver: bridge
```

### Docker Compose bilan ishga tushirish:

```bash
# Barcha servicelarni ishga tushirish
docker-compose -f docker-compose.prod.yml up -d

# Statusni ko'rish
docker-compose -f docker-compose.prod.yml ps

# Loglarni ko'rish
docker-compose -f docker-compose.prod.yml logs -f

# To'xtatish
docker-compose -f docker-compose.prod.yml down
```

---

## ✅ Tekshiruv Ro'yxati

Deploy qilgandan keyin quyidagilarni tekshiring:

- [ ] Frontend konteyner ishlayapti (`docker ps`)
- [ ] Loglarda xato yo'q
- [ ] Port 3001 ochilgan
- [ ] Frontend tashqaridan mavjud (`http://vps-ip:3001`)
- [ ] Backend'ga ulanish ishlayapti
- [ ] Browser'da frontend yuklanmoqda
- [ ] API so'rovlari muvaffaqiyatli
- [ ] Firewall to'g'ri sozlangan
- [ ] `.env.local` fayl xavfsiz (chmod 600)

---

## 🎉 Muvaffaqiyat!

Agar barcha qadamlar muvaffaqiyatli o'tgan bo'lsa, frontend endi VPS'da ishlayapti!

**Test qiling:**

- Browser'da: `http://your-vps-ip:3001`
- Backend API: `http://your-vps-ip:3000/docs`

**Keyingi qadamlar:**

- Domain va SSL sozlash
- Nginx reverse proxy sozlash
- Monitoring sozlash
- Backup strategiyasi yaratish

---

## 📞 Yordam

Agar muammo bo'lsa:

1. Loglarni tekshiring: `docker logs clinic-frontend`
2. Konteyner holatini ko'ring: `docker ps -a`
3. Environment variable'larni tekshiring: `docker exec clinic-frontend env`
4. Backend'ga ulanishni tekshiring: `curl http://localhost:3000/docs`

**Muvaffaqiyatlar! 🚀**
