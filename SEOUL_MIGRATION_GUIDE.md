# 🚀 VPS Migration Guide: Virginia → Seoul

## 📋 Migration Overview

**Current State:**

- VPS: Virginia, USA (us-east-1)
- Database: Seoul, South Korea (ap-northeast-2)
- Latency: 200ms per query ❌
- Performance: GET /products = 3251ms ❌

**Target State:**

- VPS: Seoul, South Korea (ap-northeast-2)
- Database: Seoul, South Korea (ap-northeast-2)
- Latency: 5ms per query ✅
- Performance: GET /products = 300-500ms ✅

**Expected Improvement:** 8-10x faster! 🚀

---

## ⏱️ Timeline

```
Total Time: 2-3 hours
Downtime: 5-10 minutes (DNS switch only)

Phase 1: Preparation (30 min)
Phase 2: Seoul EC2 Setup (45 min)
Phase 3: Deployment (30 min)
Phase 4: DNS Update (5 min)
Phase 5: Testing (20 min)
Phase 6: Cleanup (10 min)
```

---

## 📝 Prerequisites Checklist

- [ ] AWS Account access
- [ ] Current VPS backup
- [ ] Environment files (.env) saved locally
- [ ] Database credentials
- [ ] Docker Hub credentials (if private images)
- [ ] Domain/DNS access (if using custom domain)
- [ ] SSH key pair

---

# Phase 1: Preparation (30 minutes)

## 1.1 Backup Current VPS

```bash
# SSH to current Virginia VPS
ssh ubuntu@54.237.247.19

# Create backup directory
mkdir -p ~/backups
cd ~/backups

# Backup environment files
cp ~/clinic-erp/apps/backend/.env ./backend.env
cp ~/clinic-erp/apps/frontend/.env.local ./frontend.env
cp ~/clinic-erp/apps/supplier-backend/.env ./supplier-backend.env
cp ~/clinic-erp/apps/supplier-frontend/.env.local ./supplier-frontend.env
cp ~/clinic-erp/docker-compose.prod.yml ./docker-compose.prod.yml

# List all environment variables
docker exec clinic-erp-backend-prod env > backend-env.txt
docker exec clinic-erp-frontend-prod env > frontend-env.txt

# Download backups to local machine
# From local terminal:
# scp -r ubuntu@54.237.247.19:~/backups ~/Desktop/clinic-backup
```

## 1.2 Document Current Configuration

```bash
# Current IPs and URLs
echo "Current Virginia IP: 54.237.247.19"

# Database connection string
docker exec clinic-erp-backend-prod env | grep DATABASE_URL

# Public URLs
docker exec clinic-erp-frontend-prod env | grep NEXT_PUBLIC_API_URL

# Save this info for later!
```

---

# Phase 2: Seoul EC2 Setup (45 minutes)

## 2.1 Create Seoul EC2 Instance

### AWS Console Steps:

1. **Login to AWS Console:** https://console.aws.amazon.com/ec2/

2. **Switch Region:**

   - Top right corner → **ap-northeast-2** (Seoul)

3. **Launch Instance:**

   - Click **"Launch Instance"**

4. **Configure Instance:**

   **Name:**

   ```
   clinic-erp-seoul-prod
   ```

   **AMI:**

   ```
   Ubuntu Server 22.04 LTS (HVM), SSD Volume Type
   64-bit (x86)
   ```

   **Instance Type:**

   ```
   t3.small (or your current size)
   - 2 vCPU
   - 2 GB RAM
   ```

   **Key Pair:**

   ```
   Select existing or create new
   Download .pem file if new
   ```

   **Network Settings:**

   ```
   ✅ Auto-assign public IP: Enable

   Security Group Rules:
   - SSH (22): My IP
   - HTTP (80): 0.0.0.0/0
   - HTTPS (443): 0.0.0.0/0
   - Custom TCP (3000): 0.0.0.0/0  # Backend
   - Custom TCP (3001): 0.0.0.0/0  # Frontend
   - Custom TCP (3002): 0.0.0.0/0  # Supplier Backend
   - Custom TCP (3003): 0.0.0.0/0  # Supplier Frontend
   ```

   **Storage:**

   ```
   30 GB gp3
   ```

5. **Launch Instance**

6. **Get New IP:**
   ```
   Wait 2 minutes, then copy Public IPv4 address
   Example: 3.35.123.45
   ```

## 2.2 Connect to Seoul Instance

```bash
# From local terminal
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@NEW_SEOUL_IP

# Or if using existing key
ssh ubuntu@NEW_SEOUL_IP
```

## 2.3 Initial System Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git vim htop net-tools

# Set timezone (optional)
sudo timedatectl set-timezone Asia/Seoul

# Check location
curl ipinfo.io
# Should show: Seoul, South Korea ✅
```

## 2.4 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker ubuntu

# Apply group changes
newgrp docker

# Verify Docker
docker --version
# Should show: Docker version 24.x.x or higher

# Test Docker
docker run hello-world
```

## 2.5 Install Docker Compose

```bash
# Install Docker Compose
sudo apt install -y docker-compose

# Verify
docker-compose --version
# Should show: docker-compose version 1.29.x or higher
```

---

# Phase 3: Deployment (30 minutes)

## 3.1 Get Application Code

### Option A: Clone from Git (Recommended)

```bash
cd ~
git clone YOUR_GIT_REPOSITORY_URL clinic-erp
cd clinic-erp
```

### Option B: Copy from Old VPS

```bash
# From Seoul VPS
cd ~

# From local terminal (new window):
# scp -r ubuntu@54.237.247.19:~/clinic-erp ubuntu@NEW_SEOUL_IP:~/
```

## 3.2 Configure Environment Files

### Backend Environment

```bash
cd ~/clinic-erp
nano apps/backend/.env
```

**Content (update with your actual values):**

```env
# Supabase (Seoul Database - already correct!)
SUPABASE_URL=https://evfwomgtklpmscviprac.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.evfwomgtklpmscviprac.supabase.co:5432/postgres?connection_limit=10&pool_timeout=20&connect_timeout=10

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here

# AWS S3 (if using)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-northeast-2
AWS_S3_BUCKET=your_bucket_name

# Other
NODE_ENV=production
PORT=3000
```

### Frontend Environment

```bash
nano apps/frontend/.env.local
```

**Content:**

```env
NEXT_PUBLIC_API_URL=http://NEW_SEOUL_IP:3000
NEXT_PUBLIC_SUPABASE_URL=https://evfwomgtklpmscviprac.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### Supplier Backend Environment

```bash
nano apps/supplier-backend/.env
```

**Content:**

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.evfwomgtklpmscviprac.supabase.co:5432/postgres
SUPABASE_URL=https://evfwomgtklpmscviprac.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
NODE_ENV=production
PORT=3002
```

### Supplier Frontend Environment

```bash
nano apps/supplier-frontend/.env.local
```

**Content:**

```env
NEXT_PUBLIC_API_URL=http://NEW_SEOUL_IP:3002
NEXT_PUBLIC_SUPABASE_URL=https://evfwomgtklpmscviprac.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

## 3.3 Update Docker Compose

```bash
nano docker-compose.prod.yml
```

**Update environment variables:**

```yaml
services:
  backend:
    image: findbeauty/clinic-backend:latest
    container_name: clinic-erp-backend-prod
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - ./apps/backend/.env
    environment:
      - DATABASE_URL=postgresql://postgres:Vkdlsqbxl123%40@db.evfwomgtklpmscviprac.supabase.co:5432/postgres?connection_limit=10&pool_timeout=20&connect_timeout=10
      - SUPPLIER_BACKEND_URL=http://supplier-erp-backend-prod:3002
      - SUPPLIER_BACKEND_API_KEY=your_secret_api_key_here_34534sdffsd69ds8f8e9sdf89sd4e9e8w9f
      - NODE_OPTIONS=--max-old-space-size=2048
    networks:
      - clinic-erp-network
    mem_limit: 3g
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--quiet",
          "--tries=1",
          "--spider",
          "http://localhost:3000/docs",
        ]
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
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://13.209.40.48:3000
    env_file:
      - ./apps/frontend/.env.local
    depends_on:
      - backend
    networks:
      - clinic-erp-network

  supplier-backend:
    image: findbeauty/supplier-backend:latest
    container_name: supplier-erp-backend-prod
    restart: unless-stopped
    ports:
      - "3002:3002"
    env_file:
      - ./apps/supplier-backend/.env
    environment:
      - DATABASE_URL=postgresql://postgres:Vkdlsqbxl123%40@db.evfwomgtklpmscviprac.supabase.co:5432/postgres?connection_limit=10&pool_timeout=20&connect_timeout=10
      - CLINIC_BACKEND_URL=http://clinic-erp-backend-prod:3000
      - SUPPLIER_BACKEND_API_KEY=your_secret_api_key_here_34534sdffsd69ds8f8e9sdf89sd4e9e8w9f
    volumes:
      - ./apps/supplier-backend/keys:/app/apps/supplier-backend/keys:ro
    networks:
      - clinic-erp-network
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--quiet",
          "--tries=1",
          "--spider",
          "http://localhost:3002/docs",
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  supplier-frontend:
    image: findbeauty/supplier-frontend:latest
    container_name: supplier-erp-frontend-prod
    restart: unless-stopped
    ports:
      - "3003:3003"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=http://13.209.40.48:3002
    env_file:
      - ./apps/supplier-frontend/.env.local
    depends_on:
      - supplier-backend
    networks:
      - clinic-erp-network

networks:
  clinic-erp-network:
    driver: bridge
```

**Replace `NEW_SEOUL_IP` with actual IP!**

## 3.4 Pull Docker Images

```bash
# Login to Docker Hub (if private images)
docker login
# Enter username and password

# Pull all images
cd ~/clinic-erp
docker-compose -f docker-compose.prod.yml pull

# Verify images
docker images | grep findbeauty
```

## 3.5 Run Database Migrations

```bash
# Start only backend first
docker-compose -f docker-compose.prod.yml up -d backend

# Wait 10 seconds
sleep 10

# Run migrations
docker exec clinic-erp-backend-prod npx prisma migrate deploy

# Check migration status
docker logs clinic-erp-backend-prod | grep -i migration
```

## 3.6 Start All Services

```bash
# Start all containers
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# All should show "Up" status
```

## 3.7 Check Logs

```bash
# Backend logs
docker logs -f clinic-erp-backend-prod --tail 50

# Look for:
# ✅ "Nest application successfully started"
# ✅ No "Can't reach database" errors
# ✅ No "HIGH MEMORY USAGE" warnings (should be <50% now!)

# Frontend logs
docker logs clinic-erp-frontend-prod --tail 30

# Supplier Backend logs
docker logs supplier-erp-backend-prod --tail 30

# Supplier Frontend logs
docker logs supplier-erp-frontend-prod --tail 30
```

---

# Phase 4: DNS/IP Update (5 minutes)

## 4.1 Update Supabase IP Whitelist

1. **Supabase Dashboard:** https://app.supabase.com/project/evfwomgtklpmscviprac
2. **Settings → Database → Network Restrictions**
3. **Add restriction:**
   - IP: `NEW_SEOUL_IP`
   - Description: `VPS Seoul Production`
4. **Keep old Virginia IP** for now (remove later)

## 4.2 Test Database Connection

```bash
# From Seoul VPS
nc -zv db.evfwomgtklpmscviprac.supabase.co 5432
# Should show: succeeded! ✅

# Test API
curl http://localhost:3000/docs
# Should return HTML
```

## 4.3 Update DNS (If Using Domain)

**If using custom domain:**

1. Go to your DNS provider (Cloudflare, Route53, etc.)
2. Update A record:
   ```
   Type: A
   Name: @ (or your subdomain)
   Value: NEW_SEOUL_IP
   TTL: 300 (5 minutes)
   ```
3. Wait 5-10 minutes for propagation

**If using IP directly:**

Update your mobile app or frontend configuration with new IP.

---

# Phase 5: Testing (20 minutes)

## 5.1 Health Check

```bash
# Get new Seoul IP
curl ifconfig.me

# Test all endpoints
curl http://NEW_SEOUL_IP:3000/docs        # Backend API docs
curl http://NEW_SEOUL_IP:3001             # Frontend
curl http://NEW_SEOUL_IP:3002/docs        # Supplier Backend
curl http://NEW_SEOUL_IP:3003             # Supplier Frontend

# All should return 200 OK
```

## 5.2 Performance Test

```bash
# Check request times
docker logs clinic-erp-backend-prod --tail 100 | grep "SLOW"

# Expected: Very few or NO slow requests!
# Before: GET /products - 3251ms ❌
# After:  GET /products - 300-500ms ✅
```

## 5.3 Database Query Performance

```bash
# Check database query times
docker logs clinic-erp-backend-prod | grep "\[products\] db="

# Expected: 50-200ms (NOT 3000ms!)
```

## 5.4 Memory Usage

```bash
# Check memory
docker stats --no-stream clinic-erp-backend-prod

# Expected:
# - MEM USAGE: 200-500MB (NOT 97%!)
# - MEM %: 10-20%
```

## 5.5 Cache Performance

```bash
# Check cache stats
docker logs clinic-erp-backend-prod | grep "CacheManager" | tail -20

# Expected:
# - hits=50+, misses=10 (Good cache hit ratio!)
```

## 5.6 Functional Testing

### Test Backend API:

```bash
# Health endpoint
curl http://NEW_SEOUL_IP:3000/health

# Products endpoint (will need auth token)
# Get from browser network tab or login
```

### Test Frontend:

1. Open browser: `http://NEW_SEOUL_IP:3001`
2. Login
3. Navigate to:
   - Inbound page
   - Outbound page
   - Orders page
   - Products page
4. **Check Network tab:**
   - Request times should be 200-500ms ✅
   - NOT 3000ms ❌

---

# Phase 6: Cleanup (10 minutes)

## 6.1 Monitor for 1 Hour

```bash
# Keep monitoring logs
docker-compose -f docker-compose.prod.yml logs -f

# Check for errors
# Monitor performance
# Test all major features
```

## 6.2 Remove Old Virginia IP from Supabase

Once everything works perfectly:

1. **Supabase Dashboard**
2. **Settings → Database → Network Restrictions**
3. **Remove** Virginia IP (54.237.247.19)
4. **Keep only** Seoul IP

## 6.3 Stop Old Virginia VPS

```bash
# SSH to old Virginia VPS
ssh ubuntu@54.237.247.19

# Stop all containers
cd ~/clinic-erp
docker-compose -f docker-compose.prod.yml down

# Backup one more time (optional)
tar -czf clinic-erp-backup.tar.gz ~/clinic-erp
```

## 6.4 Terminate Virginia Instance

**AWS Console:**

1. Region: **us-east-1** (Virginia)
2. **EC2 → Instances**
3. Select old instance
4. **Instance State → Terminate**
5. Confirm

**Save money!** ~$15/month

---

# 📊 Performance Comparison

## Before (Virginia VPS + Seoul DB):

```
Location: Virginia 🇺🇸 → Seoul 🇰🇷
Distance: 11,000 km
Latency: 200ms per query

Performance:
├─ GET /products: 3251ms ❌
├─ GET /order/pending-inbound: 2202ms ❌
├─ GET /returns/available: 1635ms ❌
├─ Memory: 97% full ❌
└─ Cache hits: 0-2 ❌
```

## After (Seoul VPS + Seoul DB):

```
Location: Seoul 🇰🇷 → Seoul 🇰🇷
Distance: <10 km
Latency: 5ms per query

Performance:
├─ GET /products: 300-500ms ✅ (8x faster!)
├─ GET /order/pending-inbound: 200-300ms ✅ (9x faster!)
├─ GET /returns/available: 150-250ms ✅ (10x faster!)
├─ Memory: 20-30% ✅ (healthy!)
└─ Cache hits: 50+ ✅ (working!)
```

---

# 🔧 Troubleshooting

## Issue 1: Can't Connect to Database

```bash
# Check IP whitelist
nc -zv db.evfwomgtklpmscviprac.supabase.co 5432

# If fails:
# 1. Add Seoul IP to Supabase whitelist
# 2. Wait 1-2 minutes
# 3. Try again
```

## Issue 2: Docker Images Won't Pull

```bash
# Login to Docker Hub
docker login

# Verify credentials
docker pull findbeauty/clinic-backend:latest

# If still fails, check image names in docker-compose.prod.yml
```

## Issue 3: Frontend Can't Reach Backend

```bash
# Check NEXT_PUBLIC_API_URL
docker exec clinic-erp-frontend-prod env | grep NEXT_PUBLIC_API_URL

# Should be: http://NEW_SEOUL_IP:3000
# If wrong, update docker-compose.prod.yml and restart:
docker-compose -f docker-compose.prod.yml up -d --force-recreate frontend
```

## Issue 4: High Memory Usage

```bash
# Check NODE_OPTIONS
docker exec clinic-erp-backend-prod env | grep NODE_OPTIONS

# Should show: --max-old-space-size=2048
# If missing, add to docker-compose.prod.yml
```

## Issue 5: Still Slow

```bash
# Check database location
curl ipinfo.io/$(dig +short db.evfwomgtklpmscviprac.supabase.co | head -1)

# Should show: Seoul/Incheon, South Korea
# If not, database is in wrong region!
```

---

# 📞 Support Checklist

If you need help:

1. **Seoul VPS IP:**

   ```bash
   curl ifconfig.me
   ```

2. **Container Status:**

   ```bash
   docker ps -a
   ```

3. **Backend Logs:**

   ```bash
   docker logs clinic-erp-backend-prod --tail 100
   ```

4. **Performance Stats:**

   ```bash
   docker stats --no-stream
   ```

5. **Database Connection:**
   ```bash
   docker exec clinic-erp-backend-prod env | grep DATABASE_URL
   ```

---

# ✅ Success Checklist

- [ ] Seoul EC2 instance created
- [ ] Docker installed and running
- [ ] Application deployed
- [ ] All containers running (4/4 up)
- [ ] Database migrations applied
- [ ] API endpoints responding (3000-3003)
- [ ] Frontend loading
- [ ] Login working
- [ ] GET /products < 500ms ✅
- [ ] Memory usage < 30% ✅
- [ ] Cache working (50+ hits) ✅
- [ ] DNS updated (if applicable)
- [ ] Old VPS terminated
- [ ] Cost savings: ~$15/month ✅

---

# 🎉 Congratulations!

**Your application is now 8-10x faster!** 🚀

```
Before: 3251ms ❌
After:  350ms ✅

Performance Improvement: 927%!
```

**Users in Seoul will love the speed!** ⚡

---

# 📚 Next Steps (Optional)

## 1. Setup SSL/HTTPS (Recommended)

```bash
# Install Certbot
sudo apt install certbot

# Get SSL certificate (if using domain)
sudo certbot certonly --standalone -d yourdomain.com

# Configure Nginx reverse proxy with SSL
```

## 2. Setup Monitoring

```bash
# Use built-in monitoring
curl http://NEW_SEOUL_IP:3000/monitoring/metrics
```

## 3. Setup Automated Backups

```bash
# Create backup script
nano ~/backup.sh

# Add to crontab for daily backups
crontab -e
```

## 4. Setup CI/CD Pipeline

Configure GitHub Actions to deploy to Seoul VPS automatically.

---

# 📝 Notes

- Keep this guide for future reference
- Document any custom changes you make
- Monitor performance for first week
- Adjust cache TTL if needed
- Consider Read Replica if traffic grows

**Questions? Check troubleshooting section above!** 💪
