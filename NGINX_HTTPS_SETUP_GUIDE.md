# 🔒 Nginx va HTTPS Sozlash Guide

Bu qo'llanma **Nginx reverse proxy o'rnatishdan tortib, Let's Encrypt SSL sertifikat olish va HTTPS yoqishgacha** bo'lgan barcha qadamlarni batafsil tushuntiradi.

---

## 📋 Mundarija

1. [Oldindan Talablar](#1-oldindan-talablar)
2. [Nginx O'rnatish](#2-nginx-ornatish)
3. [Domain va DNS Sozlash](#3-domain-va-dns-sozlash)
4. [Let's Encrypt SSL Sertifikat Olish](#4-lets-encrypt-ssl-sertifikat-olish)
5. [Nginx Konfiguratsiyasi](#5-nginx-konfiguratsiyasi)
6. [Docker Container'lar bilan Integratsiya](#6-docker-containerlar-bilan-integratsiya)
7. [HTTPS Yoqish va HTTP'dan Redirect](#7-https-yoqish-va-httpdan-redirect)
8. [Multiple Subdomain'lar Sozlash](#8-multiple-subdomainlar-sozlash)
9. [Verification va Testing](#9-verification-va-testing)
10. [Troubleshooting](#10-troubleshooting)

---

## 1️⃣ Oldindan Talablar

### 1.1 Kerakli Narsalar

- ✅ VPS yoki server (Ubuntu 20.04+ yoki 22.04 LTS tavsiya etiladi)
- ✅ Root yoki sudo huquqlari
- ✅ Domain name (masalan: `jaclit.com`)
- ✅ Domain'ning DNS sozlanganligi (A yoki CNAME record)
- ✅ Docker va Docker Compose o'rnatilgan
- ✅ Docker container'lar ishlayotganligi

### 1.2 Portlar

Quyidagi portlar ochiq bo'lishi kerak:

- **80** (HTTP) - SSL sertifikat olish uchun
- **443** (HTTPS) - SSL trafik uchun
- **3000** (Backend) - Docker container
- **3001** (Clinic Frontend) - Docker container
- **3002** (Supplier Backend) - Docker container
- **3003** (Supplier Frontend) - Docker container

**Security Group yoki Firewall'da portlarni ochish:**

```bash
# UFW (Ubuntu Firewall)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
sudo ufw allow 3002/tcp
sudo ufw allow 3003/tcp
sudo ufw reload

# Yoki AWS Security Group'da:
# - Inbound Rules: 80, 443, 3000-3003 (TCP) - Source: 0.0.0.0/0
```

---

## 2️⃣ Nginx O'rnatish

### 2.1 Nginx'ni O'rnatish

```bash
# VPS'ga SSH orqali kirish
ssh ubuntu@YOUR_VPS_IP

# System update
sudo apt update
sudo apt upgrade -y

# Nginx o'rnatish
sudo apt install nginx -y

# Nginx status tekshirish
sudo systemctl status nginx

# Nginx'ni ishga tushirish va avtomatik yoqish
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2.2 Nginx Versiyasini Tekshirish

```bash
nginx -v
# Expected: nginx version: nginx/1.18.0 (Ubuntu) yoki yangiroq
```

### 2.3 Nginx Test

```bash
# Browser'da yoki curl bilan:
curl http://YOUR_VPS_IP

# Expected: Nginx welcome page HTML
```

---

## 3️⃣ Domain va DNS Sozlash

### 3.1 DNS Record'lar Sozlash

Domain provider'ingizda (GoDaddy, Namecheap, Cloudflare, va hokazo) quyidagi DNS record'larni sozlang:

#### Variant A: A Record (IP Address)

```
Type: A
Name: @ (yoki bo'sh)
Value: YOUR_VPS_IP
TTL: 3600 (yoki Auto)

Type: A
Name: clinic
Value: YOUR_VPS_IP
TTL: 3600

Type: A
Name: supplier
Value: YOUR_VPS_IP
TTL: 3600

Type: A
Name: api
Value: YOUR_VPS_IP
TTL: 3600

Type: A
Name: api-supplier
Value: YOUR_VPS_IP
TTL: 3600
```

#### Variant B: CNAME Record (Subdomain uchun)

```
Type: CNAME
Name: clinic
Value: YOUR_DOMAIN.com
TTL: 3600

Type: CNAME
Name: supplier
Value: YOUR_DOMAIN.com
TTL: 3600

Type: CNAME
Name: api
Value: YOUR_DOMAIN.com
TTL: 3600

Type: CNAME
Name: api-supplier
Value: YOUR_DOMAIN.com
TTL: 3600
```

### 3.2 DNS Propagation Tekshirish

```bash
# DNS propagation tekshirish (bir necha daqiqa yoki soat o'tishi mumkin)
dig clinic.YOUR_DOMAIN.com
dig api.YOUR_DOMAIN.com
nslookup clinic.YOUR_DOMAIN.com

# Yoki online tool ishlatish:
# https://www.whatsmydns.net/
```

**⚠️ Muhim:** DNS propagation 5 daqiqadan 48 soatgacha davom etishi mumkin. Ko'pincha 5-30 daqiqa ichida ishlaydi.

---

## 4️⃣ Let's Encrypt SSL Sertifikat Olish

### 4.1 Certbot O'rnatish

```bash
# Certbot o'rnatish
sudo apt install certbot python3-certbot-nginx -y

# Certbot versiyasini tekshirish
certbot --version
```

### 4.2 SSL Sertifikat Olish (Bir Nechta Domain uchun)

#### Variant A: Bitta Buyruq bilan (Tavsiya Etiladi)

```bash
# Barcha domain'lar uchun bir vaqtda sertifikat olish
sudo certbot --nginx -d clinic.YOUR_DOMAIN.com \
  -d supplier.YOUR_DOMAIN.com \
  -d api.YOUR_DOMAIN.com \
  -d api-supplier.YOUR_DOMAIN.com \
  --email YOUR_EMAIL@example.com \
  --agree-tos \
  --non-interactive \
  --redirect
```

#### Variant B: Alohida Sertifikatlar

```bash
# Clinic Frontend
sudo certbot --nginx -d clinic.YOUR_DOMAIN.com \
  --email YOUR_EMAIL@example.com \
  --agree-tos \
  --redirect

# Supplier Frontend
sudo certbot --nginx -d supplier.YOUR_DOMAIN.com \
  --email YOUR_EMAIL@example.com \
  --agree-tos \
  --redirect

# Clinic Backend API
sudo certbot --nginx -d api.YOUR_DOMAIN.com \
  --email YOUR_EMAIL@example.com \
  --agree-tos \
  --redirect

# Supplier Backend API
sudo certbot --nginx -d api-supplier.YOUR_DOMAIN.com \
  --email YOUR_EMAIL@example.com \
  --agree-tos \
  --redirect
```

### 4.3 Sertifikat O'rnatilganini Tekshirish

```bash
# Sertifikatlar ro'yxatini ko'rish
sudo certbot certificates

# Expected output:
# Found the following certs:
#   Certificate Name: clinic.YOUR_DOMAIN.com
#     Domains: clinic.YOUR_DOMAIN.com
#     Expiry Date: 2025-XX-XX XX:XX:XX+00:00 (VALID: XX days)
#     Certificate Path: /etc/letsencrypt/live/clinic.YOUR_DOMAIN.com/fullchain.pem
#     Private Key Path: /etc/letsencrypt/live/clinic.YOUR_DOMAIN.com/privkey.pem
```

### 4.4 Avtomatik Yangilash (Auto-renewal)

Certbot avtomatik yangilanishi kerak. Tekshirish:

```bash
# Auto-renewal test
sudo certbot renew --dry-run

# Cron job tekshirish
sudo systemctl status certbot.timer
```

**✅ Certbot avtomatik har 12 soatda tekshiradi va 30 kun qolganda yangilaydi.**

---

## 5️⃣ Nginx Konfiguratsiyasi

### 5.1 Nginx Konfiguratsiya Strukturasi

```bash
# Nginx config fayllari
/etc/nginx/
├── nginx.conf              # Asosiy config
├── sites-available/        # Mavjud site'lar
│   ├── default
│   ├── clinic.conf
│   ├── supplier.conf
│   ├── api.conf
│   └── api-supplier.conf
└── sites-enabled/          # Faol site'lar (symlink)
    ├── clinic.conf -> ../sites-available/clinic.conf
    ├── supplier.conf -> ../sites-available/supplier.conf
    ├── api.conf -> ../sites-available/api.conf
    └── api-supplier.conf -> ../sites-available/api-supplier.conf
```

### 5.2 Clinic Frontend Nginx Config

```bash
sudo nano /etc/nginx/sites-available/clinic.conf
```

**Content:**

```nginx
# Clinic Frontend (Port 3001)
server {
    listen 80;
    server_name clinic.YOUR_DOMAIN.com;
    
    # HTTP'dan HTTPS'ga redirect (Certbot qo'shadi)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name clinic.YOUR_DOMAIN.com;

    # SSL Sertifikatlar (Certbot to'ldiradi)
    ssl_certificate /etc/letsencrypt/live/clinic.YOUR_DOMAIN.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clinic.YOUR_DOMAIN.com/privkey.pem;
    
    # SSL Sozlamalari
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/clinic-access.log;
    error_log /var/log/nginx/clinic-error.log;

    # Client Max Body Size (file upload uchun)
    client_max_body_size 50M;

    # Proxy Settings
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
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health Check
    location /health {
        proxy_pass http://localhost:3001/health;
        access_log off;
    }
}
```

### 5.3 Supplier Frontend Nginx Config

```bash
sudo nano /etc/nginx/sites-available/supplier.conf
```

**Content:**

```nginx
# Supplier Frontend (Port 3003)
server {
    listen 80;
    server_name supplier.YOUR_DOMAIN.com;
    
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name supplier.YOUR_DOMAIN.com;

    ssl_certificate /etc/letsencrypt/live/supplier.YOUR_DOMAIN.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/supplier.YOUR_DOMAIN.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    access_log /var/log/nginx/supplier-access.log;
    error_log /var/log/nginx/supplier-error.log;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://localhost:3003/health;
        access_log off;
    }
}
```

### 5.4 Clinic Backend API Nginx Config

```bash
sudo nano /etc/nginx/sites-available/api.conf
```

**Content:**

```nginx
# Clinic Backend API (Port 3000)
server {
    listen 80;
    server_name api.YOUR_DOMAIN.com;
    
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.YOUR_DOMAIN.com;

    ssl_certificate /etc/letsencrypt/live/api.YOUR_DOMAIN.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.YOUR_DOMAIN.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    access_log /var/log/nginx/api-access.log;
    error_log /var/log/nginx/api-error.log;

    client_max_body_size 50M;

    # API Endpoints
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # API Docs (Swagger)
    location /docs {
        proxy_pass http://localhost:3000/docs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health Check
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

### 5.5 Supplier Backend API Nginx Config

```bash
sudo nano /etc/nginx/sites-available/api-supplier.conf
```

**Content:**

```nginx
# Supplier Backend API (Port 3002)
server {
    listen 80;
    server_name api-supplier.YOUR_DOMAIN.com;
    
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api-supplier.YOUR_DOMAIN.com;

    ssl_certificate /etc/letsencrypt/live/api-supplier.YOUR_DOMAIN.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api-supplier.YOUR_DOMAIN.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    access_log /var/log/nginx/api-supplier-access.log;
    error_log /var/log/nginx/api-supplier-error.log;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /docs {
        proxy_pass http://localhost:3002/docs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://localhost:3002/health;
        access_log off;
    }
}
```

### 5.6 Default Site'ni O'chirish

```bash
# Default site'ni disable qilish
sudo rm /etc/nginx/sites-enabled/default

# Yoki faqat comment qilish
sudo mv /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.disabled
```

### 5.7 Site'larni Enable Qilish

```bash
# Symlink yaratish (enable qilish)
sudo ln -s /etc/nginx/sites-available/clinic.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/supplier.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api-supplier.conf /etc/nginx/sites-enabled/

# Yoki bitta buyruq bilan:
sudo ln -s /etc/nginx/sites-available/{clinic,supplier,api,api-supplier}.conf /etc/nginx/sites-enabled/
```

### 5.8 Nginx Config Test va Reload

```bash
# Config sintaksisini tekshirish
sudo nginx -t

# Expected output:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# Nginx'ni reload qilish
sudo systemctl reload nginx

# Yoki restart qilish (agar reload ishlamasa)
sudo systemctl restart nginx

# Status tekshirish
sudo systemctl status nginx
```

---

## 6️⃣ Docker Container'lar bilan Integratsiya

### 6.1 Docker Container'lar Portlarini Tekshirish

```bash
# Container'lar ishlayotganini tekshirish
docker ps

# Expected output:
# CONTAINER ID   IMAGE                              STATUS        PORTS
# xxx            findbeauty/clinic-backend:latest    Up 2 hours    0.0.0.0:3000->3000/tcp
# xxx            findbeauty/clinic-frontend:latest   Up 2 hours    0.0.0.0:3001->3001/tcp
# xxx            findbeauty/supplier-backend:latest  Up 2 hours    0.0.0.0:3002->3002/tcp
# xxx            findbeauty/supplier-frontend:latest Up 2 hours    0.0.0.0:3003->3003/tcp
```

### 6.2 Localhost Portlarini Test Qilish

```bash
# Backend API test
curl http://localhost:3000/health

# Frontend test
curl http://localhost:3001

# Supplier Backend test
curl http://localhost:3002/health

# Supplier Frontend test
curl http://localhost:3003
```

### 6.3 Docker Network Tekshirish

```bash
# Docker network'ni ko'rish
docker network ls

# Container'lar network'da ekanligini tekshirish
docker network inspect clinic-erp_clinic-erp-network
```

---

## 7️⃣ HTTPS Yoqish va HTTP'dan Redirect

### 7.1 HTTP'dan HTTPS'ga Redirect

Nginx config'da allaqachon qo'shilgan:

```nginx
server {
    listen 80;
    server_name clinic.YOUR_DOMAIN.com;
    
    # HTTP'dan HTTPS'ga redirect
    return 301 https://$server_name$request_uri;
}
```

**✅ Bu barcha HTTP so'rovlarni HTTPS'ga yo'naltiradi.**

### 7.2 Environment Variables Yangilash

#### Backend `.env.production`:

```bash
cd ~/clinic-erp
nano apps/backend/.env.production
```

**O'zgartirishlar:**

```env
# Eski (HTTP):
# CLINIC_BACKEND_URL=http://YOUR_VPS_IP:3000

# Yangi (HTTPS):
CLINIC_BACKEND_URL=https://api.YOUR_DOMAIN.com

# CORS_ORIGINS yangilash
CORS_ORIGINS=https://clinic.YOUR_DOMAIN.com,https://supplier.YOUR_DOMAIN.com
```

#### Frontend `.env.production`:

```bash
nano apps/frontend/.env.production
```

**O'zgartirishlar:**

```env
# Eski (HTTP):
# NEXT_PUBLIC_API_URL=http://YOUR_VPS_IP:3000

# Yangi (HTTPS):
NEXT_PUBLIC_API_URL=https://api.YOUR_DOMAIN.com
```

#### Supplier Backend `.env.production`:

```bash
nano apps/supplier-backend/.env.production
```

**O'zgartirishlar:**

```env
# CORS_ORIGINS yangilash
CORS_ORIGINS=https://clinic.YOUR_DOMAIN.com,https://supplier.YOUR_DOMAIN.com
```

#### Supplier Frontend `.env.production`:

```bash
nano apps/supplier-frontend/.env.production
```

**O'zgartirishlar:**

```env
# Eski (HTTP):
# NEXT_PUBLIC_API_URL=http://YOUR_VPS_IP:3002

# Yangi (HTTPS):
NEXT_PUBLIC_API_URL=https://api-supplier.YOUR_DOMAIN.com
```

### 7.3 Docker Container'larni Restart Qilish

```bash
cd ~/clinic-erp

# Container'larni restart qilish
docker-compose -f docker-compose.prod.yml restart

# Yoki to'liq qayta yaratish
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# Log'larni tekshirish
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 8️⃣ Multiple Subdomain'lar Sozlash

### 8.1 Bitta Domain uchun Barcha Subdomain'lar

Agar bitta domain (`jaclit.com`) uchun barcha subdomain'lar kerak bo'lsa:

**DNS Record'lar:**

```
Type: A
Name: clinic
Value: YOUR_VPS_IP

Type: A
Name: supplier
Value: YOUR_VPS_IP

Type: A
Name: api
Value: YOUR_VPS_IP

Type: A
Name: api-supplier
Value: YOUR_VPS_IP
```

**Certbot:**

```bash
sudo certbot --nginx -d clinic.jaclit.com \
  -d supplier.jaclit.com \
  -d api.jaclit.com \
  -d api-supplier.jaclit.com \
  --email YOUR_EMAIL@example.com \
  --agree-tos \
  --redirect
```

### 8.2 Wildcard SSL Sertifikat (Ixtiyoriy)

Agar ko'p subdomain'lar kerak bo'lsa, wildcard sertifikat ishlatish mumkin:

```bash
# Wildcard sertifikat olish (DNS challenge kerak)
sudo certbot certonly --manual --preferred-challenges dns \
  -d "*.YOUR_DOMAIN.com" \
  -d "YOUR_DOMAIN.com" \
  --email YOUR_EMAIL@example.com \
  --agree-tos
```

**⚠️ Eslatma:** Wildcard sertifikat DNS challenge talab qiladi va qo'lda sozlash kerak.

---

## 9️⃣ Verification va Testing

### 9.1 HTTPS Test

```bash
# Browser'da test qilish:
# https://clinic.YOUR_DOMAIN.com
# https://supplier.YOUR_DOMAIN.com
# https://api.YOUR_DOMAIN.com/docs
# https://api-supplier.YOUR_DOMAIN.com/docs

# Yoki curl bilan:
curl -I https://clinic.YOUR_DOMAIN.com
curl -I https://api.YOUR_DOMAIN.com/health

# SSL sertifikat tekshirish:
openssl s_client -connect clinic.YOUR_DOMAIN.com:443 -servername clinic.YOUR_DOMAIN.com
```

### 9.2 HTTP'dan HTTPS'ga Redirect Test

```bash
# HTTP so'rov HTTPS'ga redirect bo'lishi kerak
curl -I http://clinic.YOUR_DOMAIN.com

# Expected:
# HTTP/1.1 301 Moved Permanently
# Location: https://clinic.YOUR_DOMAIN.com/...
```

### 9.3 SSL Labs Test

Online SSL test:

```
https://www.ssllabs.com/ssltest/analyze.html?d=clinic.YOUR_DOMAIN.com
```

**✅ A+ yoki A rating olish kerak.**

### 9.4 Nginx Log'larni Tekshirish

```bash
# Access log
sudo tail -f /var/log/nginx/clinic-access.log

# Error log
sudo tail -f /var/log/nginx/clinic-error.log

# Yoki barcha log'lar
sudo tail -f /var/log/nginx/*.log
```

### 9.5 Container Log'larni Tekshirish

```bash
# Backend log
docker logs -f clinic-erp-backend-prod

# Frontend log
docker logs -f clinic-erp-frontend-prod

# Yoki docker-compose bilan
cd ~/clinic-erp
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 🔟 Troubleshooting

### 10.1 Nginx Xatolari

#### Xatolik: `nginx: [emerg] bind() to 0.0.0.0:80 failed`

**Sabab:** Port 80 allaqachon ishlatilmoqda.

**Yechim:**

```bash
# Qaysi process port 80'ni ishlatayotganini topish
sudo lsof -i :80
sudo netstat -tulpn | grep :80

# Process'ni o'chirish yoki nginx'ni restart qilish
sudo systemctl restart nginx
```

#### Xatolik: `502 Bad Gateway`

**Sabab:** Docker container'lar ishlamayapti yoki portlar noto'g'ri.

**Yechim:**

```bash
# Container'lar ishlayotganini tekshirish
docker ps

# Portlar ochiqligini tekshirish
curl http://localhost:3000/health
curl http://localhost:3001

# Nginx config'da proxy_pass to'g'riligini tekshirish
sudo nginx -t
```

#### Xatolik: `SSL certificate problem`

**Sabab:** SSL sertifikat o'rnatilmagan yoki noto'g'ri path.

**Yechim:**

```bash
# Sertifikatlar mavjudligini tekshirish
sudo ls -la /etc/letsencrypt/live/

# Sertifikat yangilash
sudo certbot renew

# Nginx config'da path'ni tekshirish
sudo nano /etc/nginx/sites-available/clinic.conf
```

### 10.2 Certbot Xatolari

#### Xatolik: `Failed to obtain certificate`

**Sabab:** DNS propagation to'liq bo'lmagan yoki domain noto'g'ri.

**Yechim:**

```bash
# DNS tekshirish
dig clinic.YOUR_DOMAIN.com
nslookup clinic.YOUR_DOMAIN.com

# Certbot'ni qayta ishga tushirish
sudo certbot --nginx -d clinic.YOUR_DOMAIN.com --force-renewal
```

#### Xatolik: `Too many requests`

**Sabab:** Let's Encrypt rate limit (haftasiga 5 marta).

**Yechim:**

```bash
# Kuting (1 hafta) yoki staging environment ishlatish
sudo certbot --nginx -d clinic.YOUR_DOMAIN.com --staging
```

### 10.3 Docker Container Xatolari

#### Xatolik: Container ishlamayapti

**Yechim:**

```bash
# Container log'larni ko'rish
docker logs clinic-erp-backend-prod

# Container'ni restart qilish
docker restart clinic-erp-backend-prod

# Yoki docker-compose bilan
cd ~/clinic-erp
docker-compose -f docker-compose.prod.yml restart backend
```

### 10.4 CORS Xatolari

**Sabab:** Backend'da CORS_ORIGINS noto'g'ri.

**Yechim:**

```bash
# Backend .env.production'ni tekshirish
cat ~/clinic-erp/apps/backend/.env.production | grep CORS_ORIGINS

# To'g'ri format:
CORS_ORIGINS=https://clinic.YOUR_DOMAIN.com,https://supplier.YOUR_DOMAIN.com

# Container'ni restart qilish
docker restart clinic-erp-backend-prod
```

---

## 📝 Checklist

Deployment'dan keyin tekshirish:

- [ ] Nginx ishlayapti (`sudo systemctl status nginx`)
- [ ] SSL sertifikatlar o'rnatilgan (`sudo certbot certificates`)
- [ ] Barcha domain'lar HTTPS'da ishlayapti
- [ ] HTTP'dan HTTPS'ga redirect ishlayapti
- [ ] Docker container'lar ishlayapti (`docker ps`)
- [ ] Frontend'lar yuklanmoqda (`https://clinic.YOUR_DOMAIN.com`)
- [ ] API'lar ishlayapti (`https://api.YOUR_DOMAIN.com/docs`)
- [ ] CORS ishlayapti (browser console'da xatolik yo'q)
- [ ] SSL Labs test A+ yoki A rating
- [ ] Log'larda xatolik yo'q

---

## 🎯 Xulosa

Bu guide orqali:

1. ✅ Nginx reverse proxy o'rnatildi
2. ✅ Let's Encrypt SSL sertifikatlar olingan
3. ✅ HTTPS yoqildi va HTTP'dan redirect qilindi
4. ✅ Barcha subdomain'lar sozlandi
5. ✅ Docker container'lar bilan integratsiya qilindi

**Keyingi qadamlar:**

- Monitoring sozlash (Prometheus, Grafana)
- Backup strategiyasi
- Log rotation sozlash
- Performance optimization

---

## 📚 Qo'shimcha Resurslar

- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://eff-certbot.readthedocs.io/)
- [SSL Labs Test](https://www.ssllabs.com/ssltest/)

---

**✅ Muvaffaqiyatli deployment!**

