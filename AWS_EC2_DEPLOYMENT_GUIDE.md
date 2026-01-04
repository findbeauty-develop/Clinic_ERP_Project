# 🚀 AWS EC2'ga To'liq Deployment Guide

Bu qo'llanma **AWS EC2 instance yaratishdan tortib, barcha servislarni deploy qilishgacha** bo'lgan barcha qadamlarni batafsil tushuntiradi.

---

## 📋 Mundarija

1. [AWS EC2 Instance Yaratish](#1-aws-ec2-instance-yaratish)
2. [EC2'ga Kirish va Dasturlarni O'rnatish](#2-ec2ga-kirish-va-dasturlarni-ornatish)
3. [Security Group Sozlamalari](#3-security-group-sozlamalari)
4. [Project'ni EC2'ga Yuklash](#4-projectni-ec2ga-yuklash)
5. [Environment Variables Sozlash](#5-environment-variables-sozlash)
6. [Docker Image'larni Build/Pull Qilish](#6-docker-imagelarni-buildpull-qilish)
7. [Container'larni Ishga Tushirish](#7-containerlarni-ishga-tushirish)
8. [Verification va Testing](#8-verification-va-testing)
9. [Troubleshooting](#9-troubleshooting)

---

## 1️⃣ AWS EC2 Instance Yaratish

### 1.1 AWS Console'ga Kirish

1. **AWS Console'ga kiring:** https://console.aws.amazon.com
2. **EC2 service'ga o'ting:** Services → EC2 yoki qidiruvda "EC2" yozing

### 1.2 Launch Instance (Yangi Instance Yaratish)

**"Launch Instance"** tugmasini bosing.

### 1.3 Name va Tags

```
Name: clinic-erp-production
```

**Keyingi qadamga o'ting** (Next button).

### 1.4 Application and OS Images (AMI)

**Ubuntu** tanlang:

- **OS:** Ubuntu
- **Version:** Ubuntu Server 22.04 LTS (HVM), SSD Volume Type
- **Architecture:** 64-bit (x86)

**⚠️ Muhim:** Mac M1/M2 ishlatsangiz ham, production uchun **x86_64 (amd64)** tanlang, chunki Docker image'lar linux/amd64 platformasi uchun build qilingan.

### 1.5 Instance Type

**t3.medium** yoki undan yuqori tanlang:

**Tavsiya etilgan:**

- **t3.medium** (2 vCPU, 4 GB RAM) - Minimal (test uchun)
- **t3.large** (2 vCPU, 8 GB RAM) - **Tavsiya etiladi** ✅
- **t3.xlarge** (4 vCPU, 16 GB RAM) - Production uchun optimal

**Nima uchun t3.large?**

- 4 ta Docker container (Backend, Frontend, Supplier-Backend, Supplier-Frontend)
- Har bir container ~1-2 GB RAM ishlatadi
- Docker, Node.js va OS uchun qo'shimcha RAM kerak

### 1.6 Key Pair (Login Credentials)

**Yangi key pair yarating yoki mavjudni tanlang:**

#### Variant A: Yangi Key Pair (Tavsiya etiladi)

1. **"Create new key pair"** tugmasini bosing
2. **Key pair name:** `clinic-erp-key` (yoki istagan nomingiz)
3. **Key pair type:** RSA
4. **Private key file format:** `.pem` (Linux/Mac uchun) yoki `.ppk` (Windows PuTTY uchun)
5. **"Create key pair"** tugmasini bosing
6. **Key file avtomatik yuklab olinadi** - **Buni saqlab qo'ying!**

**⚠️ MUHIM:** Key file yo'qolsa, EC2'ga boshqa usul bilan kira olmaysiz. **Yedek nusxa yarating!**

#### Variant B: Mavjud Key Pair

Agar oldin yaratgan bo'lsangiz, tanlang.

**Keyingi qadamga o'ting.**

### 1.7 Network Settings

#### 1.7.1 VPC va Subnet

**Default VPC** va **Default Subnet** tanlang (birinchi marta ishlatayotgan bo'lsangiz).

#### 1.7.2 Security Group

**"Create security group"** tanlang.

**Security group name:** `clinic-erp-sg`

**Description:** `Security group for Clinic ERP application`

#### 1.7.3 Inbound Security Group Rules (Portlar)

Quyidagi **portlarni qo'shing:**

| Type       | Protocol | Port Range | Source                 | Description                     |
| ---------- | -------- | ---------- | ---------------------- | ------------------------------- |
| SSH        | TCP      | 22         | My IP (yoki 0.0.0.0/0) | SSH access                      |
| Custom TCP | TCP      | 3000       | 0.0.0.0/0              | Clinic Backend API              |
| Custom TCP | TCP      | 3001       | 0.0.0.0/0              | Clinic Frontend                 |
| Custom TCP | TCP      | 3002       | 0.0.0.0/0              | Supplier Backend API            |
| Custom TCP | TCP      | 3003       | 0.0.0.0/0              | Supplier Frontend               |
| Custom TCP | TCP      | 80         | 0.0.0.0/0              | HTTP (ixtiyoriy - Nginx uchun)  |
| Custom TCP | TCP      | 443        | 0.0.0.0/0              | HTTPS (ixtiyoriy - Nginx uchun) |

**Qo'shish:**

1. **"Add security group rule"** tugmasini bosing
2. **Type, Port, Source** to'ldiring
3. Har bir port uchun takrorlang

**⚠️ Xavfsizlik:** Production'da SSH (22) portini faqat o'z IP'ingizga cheklash tavsiya etiladi. Test uchun `0.0.0.0/0` (barcha IP'lar) qo'yish mumkin.

**Keyingi qadamga o'ting.**

### 1.8 Configure Storage

**Size:** 20 GB (yoki undan ko'p)

**Volume Type:** gp3 (General Purpose SSD) - default

**⚠️ Eslatma:**

- Docker image'lar ~2-4 GB joy egallaydi (har biri)
- Log'lar, database backup'lar uchun qo'shimcha joy kerak
- **Minimum 20 GB, tavsiya etiladi 30-50 GB**

**Keyingi qadamga o'ting.**

### 1.9 Advanced Details (Opsiyonel)

Bu qadamni o'tkazib yuborish mumkin, lekin quyidagilarni qo'shishingiz mumkin:

#### User Data (Instance ishga tushganda avtomatik run qilish)

```bash
#!/bin/bash
# Update system
apt-get update -y
apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker ubuntu

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Git
apt-get install -y git
```

**Keyingi qadamga o'ting.**

### 1.10 Summary va Launch

1. **Barcha sozlamalarni ko'rib chiqing:**

   - Instance type: t3.large
   - Key pair: clinic-erp-key
   - Security group: clinic-erp-sg (6 ta port ochiq)
   - Storage: 20 GB

2. **"Launch Instance"** tugmasini bosing

3. **Success!** Instance yaratilmoqda...

4. **"View all instances"** tugmasini bosing

---

## 2️⃣ EC2'ga Kirish va Dasturlarni O'rnatish

### 2.1 Instance Status'ni Tekshirish

EC2 Console → Instances → Instance'ni tanlang

**Status Checks:** `2/2 checks passed` bo'lishi kerak (1-2 daqiqa kutish kerak)

**Instance State:** `running` bo'lishi kerak

**Public IPv4 address** ni yozib oling (masalan: `54.123.45.67`)

### 2.2 SSH orqali EC2'ga Kirish

#### Mac/Linux:

```bash
# Key file'ga execute permission bering (birinchi marta)
chmod 400 ~/Downloads/clinic-erp-key.pem

# SSH orqali kirish
ssh -i ~/Downloads/clinic-erp-key.pem ubuntu@YOUR_PUBLIC_IP

# Masalan:
ssh -i ~/Downloads/clinic-erp-key.pem ubuntu@54.123.45.67
```

#### Windows (PuTTY):

1. **PuTTYGen** bilan `.pem` → `.ppk` ga convert qiling
2. **PuTTY** oching:
   - Host Name: `ubuntu@YOUR_PUBLIC_IP`
   - Connection → SSH → Auth → Credentials → Private key file: `.ppk` file tanlang
   - Open

**✅ Muvaffaqiyatli kirgan bo'lsangiz, terminal'da quyidagicha ko'rinadi:**

```
ubuntu@ip-172-31-xx-xx:~$
```

### 2.3 System Update

```bash
# System'ni yangilash
sudo apt update
sudo apt upgrade -y
```

### 2.4 Docker O'rnatish

```bash
# Docker o'rnatish (official script)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker service'ni ishga tushirish
sudo systemctl start docker
sudo systemctl enable docker

# Docker versiyasini tekshirish
docker --version
# Expected: Docker version 24.x.x or higher

# Ubuntu user'ni docker group'ga qo'shish
sudo usermod -aG docker ubuntu

# Logout qilib qayta kirish (guruh o'zgarishi uchun)
exit
```

**SSH orqali qayta kirish:**

```bash
ssh -i ~/Downloads/clinic-erp-key.pem ubuntu@YOUR_PUBLIC_IP
```

**Docker'siz sudo ishlatmasdan test qiling:**

```bash
docker ps
# Expected: Empty list (no error)
```

### 2.5 Docker Compose O'rnatish

```bash
# Docker Compose o'rnatish
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Execute permission bering
sudo chmod +x /usr/local/bin/docker-compose

# Docker Compose versiyasini tekshirish
docker-compose --version
# Expected: Docker Compose version v2.x.x or higher
```

**⚠️ Eslatma:** Docker Compose v2'da `docker compose` (space bilan) ishlatiladi, lekin `docker-compose` (hyphen bilan) ham ishlaydi.

### 2.6 Git O'rnatish (agar yo'q bo'lsa)

```bash
sudo apt install -y git
git --version
```

---

## 3️⃣ Security Group Sozlamalari

Agar instance yaratishda portlarni qo'shmagan bo'lsangiz, qo'shing:

### AWS Console'da:

1. **EC2 Console → Instances → Instance'ni tanlang**
2. **Security** tab → **Security groups** → Security group'ni tanlang
3. **Inbound rules** → **Edit inbound rules**
4. Quyidagi qoidalarni qo'shing:

| Type       | Protocol | Port | Source    | Description       |
| ---------- | -------- | ---- | --------- | ----------------- |
| SSH        | TCP      | 22   | 0.0.0.0/0 | SSH access        |
| Custom TCP | TCP      | 3000 | 0.0.0.0/0 | Clinic Backend    |
| Custom TCP | TCP      | 3001 | 0.0.0.0/0 | Clinic Frontend   |
| Custom TCP | TCP      | 3002 | 0.0.0.0/0 | Supplier Backend  |
| Custom TCP | TCP      | 3003 | 0.0.0.0/0 | Supplier Frontend |
| HTTP       | TCP      | 80   | 0.0.0.0/0 | HTTP              |
| HTTPS      | TCP      | 443  | 0.0.0.0/0 | HTTPS             |

5. **Save rules**

---

## 4️⃣ Project'ni EC2'ga Yuklash

**⚠️ MUHIM:** Docker Hub'dan image'lar ishlatilayotgan bo'lsa, **Git'dan butun project'ni clone qilish shart emas!** Faqat `docker-compose.prod.yml` va `.env` fayllar kerak.

### Variant A: Minimal Setup (Docker Hub'dan Pull - Tavsiya etiladi) ✅

Bu variant Docker Hub'da image'lar mavjud bo'lganda ishlatiladi. Git code'ga ehtiyoj yo'q.

```bash
# EC2'da minimal directory structure yaratish
cd ~
mkdir -p clinic-erp
cd clinic-erp

# Faqat docker-compose.prod.yml va .env fayllar uchun directory'lar yaratish
mkdir -p apps/backend apps/frontend apps/supplier-backend apps/supplier-frontend

# docker-compose.prod.yml'ni yaratish (yoki SCP orqali yuklash)
# Keyingi qadamda to'ldiramiz
```

**Keyin `docker-compose.prod.yml`'ni yarating yoki local mashinadan yuklang:**

**Local terminal'da (Mac/Linux):**

```bash
# docker-compose.prod.yml'ni EC2'ga yuklash
scp -i ~/Downloads/clinic-erp-key.pem \
  /Users/Development/Desktop/Clinic_ERP_Project/docker-compose.prod.yml \
  ubuntu@YOUR_PUBLIC_IP:~/clinic-erp/docker-compose.prod.yml
```

**Yoki EC2'da `docker-compose.prod.yml`'ni yarating:**

```bash
# EC2'da
cd ~/clinic-erp
nano docker-compose.prod.yml
# Guide'dagi docker-compose.prod.yml content'ini copy-paste qiling
```

### Variant B: Git Repository orqali (Agar code'ga ehtiyoj bo'lsa)

Agar Google Cloud Vision key yoki boshqa fayllar kerak bo'lsa, Git'dan clone qilish mumkin:

```bash
# EC2'da project directory yaratish
cd ~
mkdir -p clinic-erp
cd clinic-erp

# Git repository'ni clone qilish
git clone https://github.com/your-username/Clinic_ERP_Project.git .

# yoki agar private repo bo'lsa:
# git clone git@github.com:your-username/Clinic_ERP_Project.git .

# Project structure'ni tekshirish
ls -la
# Expected: apps/, packages/, docker-compose.prod.yml, etc.
```

**⚠️ Eslatma:** Git'dan clone qilsangiz ham, Docker Hub'dan image pull qilish tavsiya etiladi (build qilish sekin).

---

## 5️⃣ Environment Variables Sozlash

### 5.1 EC2 Public IP'ni Olish

```bash
# EC2'da
curl http://169.254.169.254/latest/meta-data/public-ipv4
# yoki AWS Console'dan ko'ring
```

**EC2 Public IP:** `YOUR_EC2_IP` (masalan: `54.123.45.67`)

### 5.2 Clinic Backend .env

```bash
# EC2'da
cd ~/clinic-erp
nano apps/backend/.env
```

**Quyidagilarni to'ldiring:**

```env
# Database (Supabase Production)
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres

# JWT
JWT_SECRET=your_super_secure_jwt_secret_production_2025

# Clinic Backend URL (EC2 IP)
CLINIC_BACKEND_URL=http://YOUR_EC2_IP:3000

# Supplier Backend Connection
SUPPLIER_BACKEND_URL=http://YOUR_EC2_IP:3002
SUPPLIER_BACKEND_API_KEY=your_secret_api_key_here_34534sdffsd69ds8f8e9sdf89sd4e9e8w9f

# Google Cloud Vision API (OCR)
GOOGLE_APPLICATION_CREDENTIALS=./keys/clinic-ocr-prod-aeccdd231e2e.json

# Solapi SMS
SOLAPI_API_KEY=your_solapi_api_key
SOLAPI_API_SECRET=your_solapi_api_secret
SOLAPI_SENDER_PHONE=01012345678

# HIRA API
HIRA_API_KEY=your_hira_api_key
HIRA_API_SECRET=your_hira_api_secret

# Port
PORT=3000
```

**Saqlash:** `Ctrl+O`, `Enter`, `Ctrl+X`

### 5.3 Clinic Frontend .env.local

```bash
nano apps/frontend/.env.local
```

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# API URL (EC2 IP)
NEXT_PUBLIC_API_URL=http://YOUR_EC2_IP:3000
```

**Saqlash:** `Ctrl+O`, `Enter`, `Ctrl+X`

### 5.4 Supplier Backend .env

```bash
nano apps/supplier-backend/.env
```

```env
# Database (Supabase Production - bir xil database)
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres

# JWT
JWT_SECRET=your_super_secure_jwt_secret_production_2025

# Supplier Backend URL
SUPPLIER_BACKEND_URL=http://YOUR_EC2_IP:3002

# Clinic Backend Connection
CLINIC_BACKEND_URL=http://YOUR_EC2_IP:3000
SUPPLIER_BACKEND_API_KEY=your_secret_api_key_here_34534sdffsd69ds8f8e9sdf89sd4e9e8w9f

# Solapi SMS
SOLAPI_API_KEY=your_solapi_api_key
SOLAPI_API_SECRET=your_solapi_api_secret
SOLAPI_SENDER_PHONE=01012345678

# Port
PORT=3002
```

**Saqlash:** `Ctrl+O`, `Enter`, `Ctrl+X`

### 5.5 Supplier Frontend .env.local

```bash
nano apps/supplier-frontend/.env.local
```

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# API URL (Supplier Backend)
NEXT_PUBLIC_API_URL=http://YOUR_EC2_IP:3002
```

**Saqlash:** `Ctrl+O`, `Enter`, `Ctrl+X`

### 5.6 Google Cloud Vision Key (OCR uchun)

**Agar OCR ishlatilsa:**

```bash
# Keys directory yaratish
mkdir -p apps/backend/keys

# Local mashinadan key file'ni yuklash (yoki SCP orqali)
# Local terminal'da:
scp -i ~/Downloads/clinic-erp-key.pem \
  /Users/Development/Desktop/Clinic_ERP_Project/apps/backend/keys/clinic-ocr-prod-aeccdd231e2e.json \
  ubuntu@YOUR_EC2_IP:~/clinic-erp/apps/backend/keys/clinic-ocr-prod-aeccdd231e2e.json
```

**EC2'da tekshirish:**

```bash
ls -la apps/backend/keys/
```

### 5.7 docker-compose.prod.yml'ni Yangilash

```bash
nano docker-compose.prod.yml
```

**`NEXT_PUBLIC_API_URL`'larni EC2 IP'ga o'zgartiring:**

```yaml
services:
  frontend:
    environment:
      - NEXT_PUBLIC_API_URL=http://YOUR_EC2_IP:3000 # ✅ O'zgartiring

  supplier-frontend:
    environment:
      - NEXT_PUBLIC_API_URL=http://YOUR_EC2_IP:3002 # ✅ O'zgartiring
```

**Saqlash:** `Ctrl+O`, `Enter`, `Ctrl+X`

---

## 6️⃣ Docker Image'larni Build/Pull Qilish

### 📦 Local'da Docker Image Build va Push Qilish

**Agar kod o'zgarishlari bo'lsa va Docker Hub'ga yangi image push qilish kerak bo'lsa:**

#### 6.0.1 update-docker-images.sh Script Ishlatish (Tavsiya etiladi)

```bash
# Local mashinada (project root directory'da)
chmod +x update-docker-images.sh
./update-docker-images.sh
```

**Script sizdan qaysi servislarni rebuild qilishni so'raydi:**

- Barcha servislar
- Faqat Backend'lar
- Faqat Frontend'lar
- Yoki alohida servislar

**Script avtomatik ravishda:**

1. Docker Hub'ga login qiladi
2. `linux/amd64` platformasi uchun build qiladi
3. Docker Hub'ga push qiladi

#### 6.0.2 Manual Build va Push

**Agar script ishlamasa yoki manual qilmoqchi bo'lsangiz:**

```bash
# Local mashinada (project root directory'da)
cd /Users/Development/Desktop/Clinic_ERP_Project

# Docker Hub'ga login
docker login

# Buildx'ni tayyorlash
docker buildx create --use --name multiarch-builder 2>/dev/null || docker buildx use multiarch-builder
docker buildx inspect --bootstrap

# EC2 IP'ni o'zgartiring
export VPS_IP="54.237.247.19"  # ✅ O'z EC2 IP'ingizga o'zgartiring
export BACKEND_URL="http://${VPS_IP}:3000"
export SUPPLIER_BACKEND_URL="http://${VPS_IP}:3002"

# Clinic Backend build va push
docker buildx build \
  --platform linux/amd64 \
  -f apps/backend/Dockerfile \
  -t findbeauty/clinic-backend:latest \
  --push .

# Clinic Frontend build va push
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=${BACKEND_URL} \
  -f apps/frontend/Dockerfile \
  -t findbeauty/clinic-frontend:latest \
  --push .

# Supplier Backend build va push
docker buildx build \
  --platform linux/amd64 \
  -f apps/supplier-backend/Dockerfile \
  -t findbeauty/supplier-backend:latest \
  --push .

# Supplier Frontend build va push
docker buildx build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL=${SUPPLIER_BACKEND_URL} \
  -f apps/supplier-frontend/Dockerfile \
  -t findbeauty/supplier-frontend:latest \
  --push .
```

**⏱️ Vaqt:** Har bir image uchun 3-10 daqiqa (internet tezligi va CPU'ga qarab)

**✅ Build muvaffaqiyatli bo'lsa, Docker Hub'da yangi image'lar paydo bo'ladi.**

---

### Variant A: Docker Hub'dan Pull (Tavsiya etiladi - Tez) ✅

**✅ Agar image'lar allaqachon Docker Hub'da bo'lsa (QUICK_DEPLOY_GUIDE.md bo'yicha build qilingan):**

Docker Hub'da `findbeauty/clinic-backend:latest`, `findbeauty/clinic-frontend:latest`, `findbeauty/supplier-backend:latest`, `findbeauty/supplier-frontend:latest` image'lar mavjud bo'lsa, faqat pull qilish kifoya:

```bash
# EC2'da
cd ~/clinic-erp

# Docker Hub'ga login (agar private repo bo'lsa)
# docker login
# Username: findbeauty
# Password: [Docker Hub parolingiz]

# Image'larni pull qilish
docker pull findbeauty/clinic-backend:latest
docker pull findbeauty/clinic-frontend:latest
docker pull findbeauty/supplier-backend:latest
docker pull findbeauty/supplier-frontend:latest

# Pull qilingan image'larni tekshirish
docker images | grep findbeauty

# Expected output:
# findbeauty/clinic-backend        latest    abc123def456   2 hours ago    850MB
# findbeauty/clinic-frontend       latest    def456abc123   2 hours ago    450MB
# findbeauty/supplier-backend      latest    ghi789def456   2 hours ago    850MB
# findbeauty/supplier-frontend     latest    jkl012abc123   2 hours ago    450MB
```

**⏱️ Vaqt:** Har bir image uchun 2-5 daqiqa (internet tezligiga qarab)

**✅ Bu variant eng tez va tavsiya etiladi, chunki:**

- Image'lar allaqachon Docker Hub'da mavjud
- Build qilish shart emas (30-60 daqiqa vaqt ketmaydi)
- EC2'da minimal resurs ishlatiladi

### Variant B: EC2'da Build Qilish (Sekin, lekin to'liq control)

**Agar Docker Hub'da image'lar yo'q bo'lsa:**

```bash
# Node.js va pnpm o'rnatish
curl -fsSL https://get.pnpm.io/install.sh | sh -
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"
source ~/.bashrc

# Build qilish (juda uzoq vaqt ketadi - 30-60 daqiqa)
cd ~/clinic-erp

# Clinic Backend
docker build -f apps/backend/Dockerfile -t clinic-backend:latest .

# Clinic Frontend (API URL bilan)
docker build --build-arg NEXT_PUBLIC_API_URL=http://YOUR_EC2_IP:3000 -f apps/frontend/Dockerfile -t clinic-frontend:latest .

# Supplier Backend
docker build -f apps/supplier-backend/Dockerfile -t supplier-backend:latest .

# Supplier Frontend
docker build --build-arg NEXT_PUBLIC_API_URL=http://YOUR_EC2_IP:3002 -f apps/supplier-frontend/Dockerfile -t supplier-frontend:latest .
```

**⚠️ Eslatma:** Variant A tezroq va tavsiya etiladi.

---

## 7️⃣ Container'larni Ishga Tushirish

### 7.1 docker-compose.prod.yml'ni Tekshirish

```bash
cd ~/clinic-erp
cat docker-compose.prod.yml
```

**Image name'lar to'g'riligini tekshiring:**

- `findbeauty/clinic-backend:latest`
- `findbeauty/clinic-frontend:latest`
- `findbeauty/supplier-backend:latest`
- `findbeauty/supplier-frontend:latest`

**Agar Variant B (local build) ishlatgan bo'lsangiz, `docker-compose.prod.yml`'ni yangilang:**

```bash
nano docker-compose.prod.yml
```

docker-compose -f docker-compose.prod.yml up -d frontend supplier-frontend --force-recreate

**Image name'larini o'zgartiring:**

```yaml
services:
  backend:
    image: clinic-backend:latest # ✅ Docker Hub'dan pull qilinsa: findbeauty/clinic-backend:latest

  frontend:
    image: clinic-frontend:latest # ✅ Docker Hub'dan pull qilinsa: findbeauty/clinic-frontend:latest

  supplier-backend:
    image: supplier-backend:latest # ✅ Docker Hub'dan pull qilinsa: findbeauty/supplier-backend:latest

  supplier-frontend:
    image: supplier-frontend:latest # ✅ Docker Hub'dan pull qilinsa: findbeauty/supplier-frontend:latest
```

### 7.2 Eski Container'larni Tozalash

```bash
# Eski container'lar bo'lsa, to'xtatib o'chirish
docker-compose -f docker-compose.prod.yml down

# yoki
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true
```

### 7.3 Container'larni Ishga Tushirish

```bash
# Container'larni ishga tushirish
docker-compose -f docker-compose.prod.yml up -d

# Container'lar holatini tekshirish
docker ps

# Expected output:
# CONTAINER ID   IMAGE                                  STATUS        PORTS
# abc123...      findbeauty/clinic-backend:latest       Up 5 seconds  0.0.0.0:3000->3000/tcp
# def456...      findbeauty/clinic-frontend:latest      Up 5 seconds  0.0.0.0:3001->3001/tcp
# ghi789...      findbeauty/supplier-backend:latest     Up 5 seconds  0.0.0.0:3002->3002/tcp
# jkl012...      findbeauty/supplier-frontend:latest    Up 5 seconds  0.0.0.0:3003->3003/tcp
```

# EC2'da

cd ~/clinic-erp

# Backend container'ni restart qilish

docker-compose -f docker-compose.prod.yml restart backend

# Yoki agar docker compose (space bilan) ishlatilsa:

docker compose -f docker-compose.prod.yml restart backend

### 7.4 Yangi Image'larni Pull va Container'larni Yangilash

**Agar Docker Hub'da yangi image'lar push qilingan bo'lsa:**

```bash
cd ~/clinic-erp

# Yangi image'larni pull qilish
docker compose -f docker-compose.prod.yml pull

# Container'larni yangilash (yangi image'larni ishlatish)
docker-compose -f docker-compose.prod.yml up -d --force-recreate

# Yoki faqat bitta servisni yangilash (masalan, backend)
docker-compose -f docker-compose.prod.yml pull backend
docker-compose -f docker-compose.prod.yml up -d --force-recreate backend
```

**✅ Yangilash muvaffaqiyatli bo'lsa:**

- Container'lar yangi image'lardan ishga tushadi
- Eski container'lar avtomatik o'chiriladi

### 7.5 Log'larni Tekshirish

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

**✅ Success ko'rsatkichlari:**

- Backend: `Nest application successfully started on port 3000`
- Backend: `PrismaService initialized` (faqat 1 marta ko'rinishi kerak - performance optimizatsiyasi)
- Frontend: `Ready on http://0.0.0.0:3001`

---

## 8️⃣ Verification va Testing

### 8.1 Backend Health Check

**EC2'da yoki local mashinadan:**

```bash
# Clinic Backend
curl http://YOUR_EC2_IP:3000/docs
# Expected: Swagger UI HTML yoki 200 OK

# Supplier Backend
curl http://YOUR_EC2_IP:3002/docs
# Expected: Supplier Swagger UI HTML yoki 200 OK
```

**Browser'da ochish:**

- Clinic Backend Swagger: `http://YOUR_EC2_IP:3000/docs`
- Supplier Backend Swagger: `http://YOUR_EC2_IP:3002/docs`

### 8.2 Frontend Access

**Browser'da ochish:**

- **Clinic Frontend:** `http://YOUR_EC2_IP:3001`
- **Supplier Frontend:** `http://YOUR_EC2_IP:3003`

### 8.3 Database Connection Test

```bash
# Backend container ichiga kirish
docker exec -it clinic-erp-backend-prod sh

# Environment variable'larni tekshirish
printenv | grep DATABASE_URL

# Exit
exit
```

### 8.4 Container Status

```bash
# Container'lar holatini tekshirish
docker ps

# Agar container'lar restart bo'layotgan bo'lsa:
docker ps -a

# Log'larni ko'rish
docker logs clinic-erp-backend-prod | tail -50
```

### 8.5 Full Application Test

1. **Login Test:**

   - `http://YOUR_EC2_IP:3001/login` oching
   - Test user bilan login qiling

2. **Order Flow Test:**

   - Yangi order yarating
   - Supplier frontend'da tekshiring: `http://YOUR_EC2_IP:3003`

3. **Inbound/Product Test:**
   - Yangi mahsulot qo'shing
   - Stock'ni tekshiring

---

## 9️⃣ Troubleshooting

### ❌ Error: "Cannot connect to EC2"

**Sabab:** Security Group'da SSH porti (22) ochiq emas.

**Yechim:**

1. AWS Console → EC2 → Security Groups
2. Inbound rules → SSH (22) qo'shing

### ❌ Error: "Connection refused" (Portlar)

**Sabab:** Security Group'da portlar ochiq emas.

**Yechim:**

- Security Group'da 3000, 3001, 3002, 3003 portlarini qo'shing

### ❌ Error: "Out of Memory" (OOM)

**Sabab:** RAM yetarli emas.

**Yechim:**

1. Instance type'ni kattalashtiring (t3.large → t3.xlarge)
2. Yoki boshqa container'larni to'xtating

### ❌ Error: "Cannot connect to database"

**Sabab:** Supabase Security Group EC2 IP'ga ruxsat bermaydi.

**Yechim:**

1. Supabase Dashboard → Database → Connection Pooling
2. EC2 IP'ni allowlist'ga qo'shing (yoki 0.0.0.0/0)

### ❌ Error: "Container keeps restarting"

**Sabab:** Application xato.

**Yechim:**

```bash
# Log'larni ko'rish
docker logs clinic-erp-backend-prod

# Common issues:
# - DATABASE_URL not set
# - Port already in use
# - Missing environment variables
```

### ❌ Error: "Disk full"

**Sabab:** Docker image'lar ko'p joy egallaydi.

**Yechim:**

```bash
# Docker cleanup
docker system prune -a --volumes

# Disk usage
df -h
```

### ❌ Error: "Frontend cannot connect to backend"

**Sabab:** `NEXT_PUBLIC_API_URL` noto'g'ri.

**Yechim:**

1. `docker-compose.prod.yml`'da `NEXT_PUBLIC_API_URL` ni tekshiring
2. Frontend'ni qayta build qiling (Variant B bo'lsa)
3. Container'ni restart qiling: `docker compose restart frontend`

---

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] AWS account yaratildi
- [ ] EC2 instance yaratildi (t3.large yoki undan yuqori)
- [ ] Key pair yaratildi va saqlandi
- [ ] Security Group sozlandi (6 ta port ochiq)
- [ ] EC2'ga SSH orqali kirildi
- [ ] Docker va Docker Compose o'rnatildi
- [ ] Project EC2'ga yuklandi (Git yoki SCP)

### Configuration

- [ ] `apps/backend/.env` to'ldirildi
- [ ] `apps/frontend/.env.local` to'ldirildi
- [ ] `apps/supplier-backend/.env` to'ldirildi
- [ ] `apps/supplier-frontend/.env.local` to'ldirildi
- [ ] `docker-compose.prod.yml` EC2 IP bilan yangilandi
- [ ] Google Cloud Vision key yuklandi (agar kerak bo'lsa)

### Deployment

- [ ] **Local'da:** Kod o'zgarishlari commit va push qilindi
- [ ] **Local'da:** Docker image'lar build va push qilindi (`./update-docker-images.sh` yoki manual)
- [ ] **EC2'da:** Yangi image'lar pull qilindi (`docker compose pull`)
- [ ] **EC2'da:** Container'lar yangilandi (`docker compose up -d --force-recreate`)
- [ ] Container'lar running (`docker ps`)
- [ ] Log'larda xatolar yo'q
- [ ] Backend log'larida `PrismaService initialized` faqat 1 marta ko'rinadi (performance optimizatsiyasi)

### Verification

- [ ] Backend Swagger ochiladi (`/docs`)
- [ ] Frontend ochiladi (browser)
- [ ] Login ishlayapti
- [ ] Database connection success
- [ ] Order flow ishlayapti

---

## 🎉 Muvaffaqiyatli Deployment!

**Production URLs:**

- 🏥 **Clinic Frontend:** `http://YOUR_EC2_IP:3001`
- 🔧 **Clinic Backend API:** `http://YOUR_EC2_IP:3000/docs`
- 🏭 **Supplier Frontend:** `http://YOUR_EC2_IP:3003`
- 🔧 **Supplier Backend API:** `http://YOUR_EC2_IP:3002/docs`

**⚠️ Eslatma:** Agar Nginx va domain ishlatmoqchi bo'lsangiz, qo'shimcha sozlash kerak. Hozircha faqat IP orqali ishlatiladi.

---

## 📞 Keyingi Qadamlar

1. **Monitoring:** CloudWatch yoki boshqa monitoring tool qo'shing
2. **Backup:** Database backup'larini muntazam qiling
3. **Auto-scaling:** Load balancer va Auto Scaling Group sozlang (kerak bo'lsa)
4. **Domain + SSL (ixtiyoriy):** Agar kerak bo'lsa, Nginx va Let's Encrypt sozlash mumkin

---

## 💰 Xarajatlar

**t3.large instance:**

- **On-Demand:** ~$0.0832/soat (~$60/oy)
- **Reserved Instance (1 yil):** ~$30-40/oy
- **Spot Instance:** ~$20-25/oy (unstable, test uchun)

**Storage (20 GB gp3):**

- ~$2/oy

**Data Transfer:**

- First 100 GB/oy: Free
- Keyingi: $0.09/GB

**Jami:** ~$62-65/oy (On-Demand)

---

---

## 🔄 Yangi O'zgarishlarni Deploy Qilish (Update Workflow)

### Workflow Overview

1. **Local'da kod o'zgarishlari qiling**
2. **Git'ga commit va push qiling**
3. **Docker image'larni build va push qiling**
4. **EC2'da yangi image'larni pull qiling**
5. **Container'larni restart qiling**

### Step-by-Step Update Process

#### Step 1: Local'da Kod O'zgarishlari

```bash
# Local mashinada
cd /Users/Development/Desktop/Clinic_ERP_Project

# O'zgarishlarni commit qilish
git add .
git commit -m "feat: your changes description"

# Git'ga push qilish
git push origin main  # yoki develop branch
```

#### Step 2: Docker Image'larni Build va Push

```bash
# update-docker-images.sh script ishlatish (tavsiya etiladi)
./update-docker-images.sh

# Yoki manual build (yuqorida ko'rsatilgan)
```

**Qaysi servislarni rebuild qilish kerak?**

- **Backend o'zgarishlari:** Faqat backend'lar (Clinic + Supplier)
- **Frontend o'zgarishlari:** Faqat frontend'lar (Clinic + Supplier)
- **Database schema o'zgarishlari:** Faqat backend'lar + migration qilish kerak
- **Environment variable o'zgarishlari:** Barcha servislar

#### Step 3: EC2'da Yangilash

```bash
# SSH orqali EC2'ga kirish
ssh -i ~/path/to/key.pem ubuntu@YOUR_EC2_IP

# Project directory'ga o'tish
cd ~/clinic-erp

# Yangi image'larni pull qilish
docker compose -f docker-compose.prod.yml pull

# Container'larni yangilash
docker-compose -f docker-compose.prod.yml up -d --force-recreate

# Log'larni tekshirish
docker-compose -f docker-compose.prod.yml logs -f backend
```

#### Step 4: Verification

```bash
# Container'lar holatini tekshirish
docker ps

# Backend log'larida PrismaService faqat 1 marta initialize bo'lishi kerak
docker logs clinic-erp-backend-prod | grep "PrismaService initialized"

# Health check
curl http://localhost:3000/docs  # Backend Swagger
curl http://localhost:3001      # Frontend
```

### ⚠️ Muhim Eslatmalar

1. **PrismaModule O'zgarishlari:**

   - `PrismaService` endi `PrismaModule` orqali global qilingan
   - Backend log'larida `PrismaService initialized` faqat 1 marta ko'rinishi kerak
   - Bu performance optimizatsiyasi - ko'p marta initialize bo'lmasligi kerak

2. **Database Migration:**

   - Agar database schema o'zgargan bo'lsa, migration qilish kerak
   - EC2'da: `docker exec -it clinic-erp-backend-prod npx prisma migrate deploy`
   - Yoki Supabase Dashboard'dan manual migration qilish

3. **Environment Variables:**

   - `.env` fayllar o'zgargan bo'lsa, container'larni restart qilish kerak
   - Yoki `docker compose down` va `docker compose up -d` qilish

4. **Frontend Build:**
   - Frontend o'zgarishlari uchun `NEXT_PUBLIC_API_URL` to'g'ri bo'lishi kerak
   - Build vaqtida environment variable'lar bake qilinadi
   - Agar `NEXT_PUBLIC_API_URL` o'zgarsa, yangi build kerak

### 🚀 Quick Update Script (EC2'da)

EC2'da tez yangilash uchun script yarating:

```bash
# EC2'da
nano ~/update-containers.sh

# Script content:
#!/bin/bash
cd ~/clinic-erp
echo "🔄 Pulling latest images..."
docker compose -f docker-compose.prod.yml pull
echo "🔄 Restarting containers..."
docker compose -f docker-compose.prod.yml up -d --force-recreate
echo "✅ Containers updated!"
docker ps

# Script'ni executable qilish
chmod +x ~/update-containers.sh

# Ishlatish
~/update-containers.sh
```

---

**Last Updated:** 2025-01-03  
**Version:** 1.0.0  
**Author:** Clinic ERP Development Team
