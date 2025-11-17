# VPS'ga Deploy Qilish - To'liq Qo'llanma

Bu qo'llanma sizga VPS'da backend'ni boshidan oxirigacha deploy qilishni ko'rsatadi.

---

## 📋 Kerakli Ma'lumotlar

Deploy qilishdan oldin quyidagi ma'lumotlarni tayyorlang:

- ✅ VPS IP manzili yoki domain
- ✅ VPS'ga SSH kirish (username va password yoki SSH key)
- ✅ Supabase URL va Service Role Key
- ✅ Database URL (agar kerak bo'lsa)

---

## 🚀 QADAM 1: VPS'ga Kirish

### SSH orqali kirish:

```bash
ssh root@your-vps-ip
# yoki
ssh username@your-vps-ip
```

Agar SSH key ishlatsangiz:

```bash
ssh -i ~/.ssh/your-key.pem root@your-vps-ip
```

---

## 🐳 QADAM 2: Docker va Docker Compose O'rnatish

### Docker o'rnatish:

```bash
# Docker o'rnatish
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Docker'ni tekshirish
docker --version
```

### Docker Compose o'rnatish:

```bash
# Docker Compose o'rnatish
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Docker Compose'ni tekshirish
docker-compose --version
```

### Docker'ni ishga tushirish:

```bash
# Docker service'ni ishga tushirish
sudo systemctl start docker
sudo systemctl enable docker

# Docker'ni tekshirish
sudo docker ps
```

---

## 📁 QADAM 3: Project Papkasini Yaratish

```bash
# Project papkasini yaratish
mkdir -p ~/clinic-erp/apps/backend
cd ~/clinic-erp

# Papka yaratilganini tekshirish
pwd
# Natija: /root/clinic-erp yoki /home/username/clinic-erp bo'lishi kerak
```

---

## 🔐 QADAM 4: Environment Variable Faylini Yaratish

### Backend .env faylini yaratish:

```bash
nano ~/clinic-erp/apps/backend/.env
```

### .env fayliga quyidagilarni qo'shing (o'z qiymatlaringiz bilan):

```env
# Supabase Configuration
SUPABASE_URL=https://vpzhvfawmpkgtwwlnrik.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhyb3hyZ3h6ZHh4eHV2aHhsZW93Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjkxMzE0NCwiZXhwIjoyMDc4NDg5MTQ0fQ.dSXaVypuNHaOaDrv4CwJIi3dfMFV90ba-JoVTPrqtHE

# Database Configuration
DATABASE_URL=postgresql://user:password@host:5432/database

# Server Configuration
PORT=3000
NODE_ENV=production
```

**Muhim:**

- `SUPABASE_SERVICE_ROLE_KEY` ni o'z haqiqiy key'ingiz bilan almashtiring
- `DATABASE_URL` ni o'z database URL'ingiz bilan almashtiring

### Faylni saqlash:

- `Ctrl + O` (saqlash)
- `Enter` (tasdiqlash)
- `Ctrl + X` (chiqish)

### Faylni tekshirish:

```bash
cat ~/clinic-erp/apps/backend/.env
```

---

## 📥 QADAM 5: Docker Hub'dan Image'ni Pull Qilish

```bash
# Docker Hub'ga login qilish (birinchi marta)
docker login
# Username: findbeauty
# Password: (Docker Hub parolingiz)

# Backend image'ni pull qilish
docker pull findbeauty/clinic-backend:latest

# Image pull qilinganini tekshirish
docker images | grep clinic-backend
```

**Natija:** `findbeauty/clinic-backend   latest   ...` ko'rinishi kerak

---

## 🚀 QADAM 6: Konteynerni Ishga Tushirish

### Variant A: Oddiy Docker Run (Tavsiya etiladi)

```bash
docker run -d \
  --name clinic-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file ~/clinic-erp/apps/backend/.env \
  findbeauty/clinic-backend:latest
```

**Parametrlar tushuntirishi:**

- `-d` - background'da ishlash
- `--name clinic-backend` - konteyner nomi
- `--restart unless-stopped` - avtomatik qayta ishga tushish
- `-p 3000:3000` - port mapping (host:container)
- `--env-file` - environment variable fayl

### Variant B: Docker Compose bilan

Avval `docker-compose.prod.yml` faylini VPS'ga ko'chiring, keyin:

```bash
cd ~/clinic-erp
docker-compose -f docker-compose.prod.yml up -d
```

---

## ✅ QADAM 7: Statusni Tekshirish

### Konteyner ishlayotganini ko'rish:

```bash
docker ps
```

**Natija:** `clinic-backend` konteyneri `Up` holatida bo'lishi kerak

### Loglarni ko'rish:

```bash
# So'nggi 50 qator log
docker logs --tail 50 clinic-backend

# Real-time loglar (Ctrl+C bilan to'xtatish)
docker logs -f clinic-backend
```

**Muvaffaqiyatli ishga tushgan belgilar:**

- ✅ `[NestApplication] Nest application successfully started`
- ✅ `Server is running on port 3000`
- ❌ `ERROR` xatolar bo'lmasligi kerak

### Konteyner ichida test qilish:

```bash
# Konteyner ichida environment variable'larni tekshirish
docker exec clinic-backend env | grep SUPABASE

# Konteyner ichida API'ni test qilish
docker exec clinic-backend wget -qO- http://localhost:3000/docs
```

---

## 🔥 QADAM 8: Firewall Sozlash

### UFW (Ubuntu/Debian):

```bash
# Port 3000 ni ochish
sudo ufw allow 3000/tcp

# Firewall'ni yoqish (agar yo'q bo'lsa)
sudo ufw enable

# Statusni tekshirish
sudo ufw status
```

### Firewalld (CentOS/RHEL):

```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### iptables (boshqa distributivlar):

```bash
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables-save
```

---

## 🌐 QADAM 9: Test Qilish

### VPS ichida test:

```bash
# Localhost orqali test
curl http://localhost:3000/docs

# yoki
curl http://localhost:3000
```

### Tashqaridan test (browser yoki Postman):

```
http://your-vps-ip:3000/docs
http://your-vps-ip:3000
```

**Muvaffaqiyatli natija:**

- Swagger documentation ko'rinishi kerak (`/docs`)
- Yoki JSON response olish kerak

---

## 🔄 QADAM 10: Yangilash (Keyinchalik)

Yangi versiyani olish uchun:

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
```

---

## 🛠️ Muammolarni Hal Qilish

### Muammo 1: Konteyner ishlamayapti

```bash
# Konteyner holatini ko'rish
docker ps -a

# Xato loglarini ko'rish
docker logs clinic-backend

# Konteynerni qayta ishga tushirish
docker restart clinic-backend
```

### Muammo 2: Environment variable xatosi

```bash
# .env faylni tekshirish
cat ~/clinic-erp/apps/backend/.env

# Konteyner ichida environment variable'larni tekshirish
docker exec clinic-backend env | grep SUPABASE

# Agar xato bo'lsa, .env faylni to'g'rilang va konteynerni qayta ishga tushiring
docker restart clinic-backend
```

### Muammo 3: Port ochilmagan

```bash
# Port 3000 ochilganini tekshirish
sudo netstat -tulpn | grep 3000
# yoki
sudo ss -tulpn | grep 3000

# Agar ochilmagan bo'lsa, firewall sozlang (QADAM 8 ga qarang)
```

### Muammo 4: Image topilmayapti

```bash
# Docker Hub'ga login qiling
docker login

# Image'ni qayta pull qiling
docker pull findbeauty/clinic-backend:latest
```

### Muammo 5: Konteyner tez-tez o'chib qolmoqda

```bash
# Loglarni batafsil ko'rish
docker logs --tail 100 clinic-backend

# Konteyner resurslarini tekshirish
docker stats clinic-backend
```

---

## 📊 QADAM 11: Monitoring va Loglar

### Loglarni ko'rish:

```bash
# Real-time loglar
docker logs -f clinic-backend

# So'nggi 100 qator
docker logs --tail 100 clinic-backend

# Muayyan vaqt oralig'idagi loglar
docker logs --since 1h clinic-backend
```

### Konteyner statistikasi:

```bash
# Resurs ishlatilishini ko'rish
docker stats clinic-backend

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

### .env fayl xavfsizligi:

```bash
# .env fayl ruxsatlarini cheklash
chmod 600 ~/clinic-erp/apps/backend/.env

# Faqat owner o'qishi mumkin
ls -la ~/clinic-erp/apps/backend/.env
```

### Firewall qoidalari:

```bash
# Faqat kerakli portlarni ochish
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 3000/tcp # Backend
sudo ufw enable
```

### Docker xavfsizlik:

```bash
# Docker socket'ni himoya qilish
sudo chmod 666 /var/run/docker.sock
# yoki faqat docker group'ga ruxsat berish
sudo usermod -aG docker $USER
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
sudo nano /etc/nginx/sites-available/clinic-erp
```

Quyidagilarni qo'shing:

```nginx
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
```

### Nginx'ni ishga tushirish:

```bash
sudo ln -s /etc/nginx/sites-available/clinic-erp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL sertifikat (Let's Encrypt):

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.yourdomain.com
```

---

## ✅ Tekshiruv Ro'yxati

Deploy qilgandan keyin quyidagilarni tekshiring:

- [ ] Docker o'rnatilgan va ishlayapti
- [ ] Docker Compose o'rnatilgan
- [ ] `.env` fayl to'g'ri yaratilgan va to'ldirilgan
- [ ] Image muvaffaqiyatli pull qilingan
- [ ] Konteyner ishlayapti (`docker ps`)
- [ ] Loglarda xato yo'q
- [ ] Port 3000 ochilgan
- [ ] API tashqaridan mavjud (`http://vps-ip:3000/docs`)
- [ ] Firewall to'g'ri sozlangan
- [ ] `.env` fayl xavfsiz (chmod 600)

---

## 🎉 Muvaffaqiyat!

Agar barcha qadamlar muvaffaqiyatli o'tgan bo'lsa, backend endi VPS'da ishlayapti!

**Test qiling:**

- Browser'da: `http://your-vps-ip:3000/docs`
- Postman yoki curl bilan API'ni test qiling

**Keyingi qadamlar:**

- Frontend'ni deploy qilish (agar kerak bo'lsa)
- Domain va SSL sozlash
- Monitoring sozlash
- Backup strategiyasi yaratish

---

## 📞 Yordam

Agar muammo bo'lsa:

1. Loglarni tekshiring: `docker logs clinic-backend`
2. Konteyner holatini ko'ring: `docker ps -a`
3. Environment variable'larni tekshiring: `docker exec clinic-backend env`

**Muvaffaqiyatlar! 🚀**
