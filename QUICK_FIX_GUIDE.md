# ⚡ QUICK FIX GUIDE - Production Deployment

## Tez-tez uchraydigan muammolar va yechimlar

---

## 🚨 KRITIK FIX: Supplier Backend OrderItem Schema

### Agar order yaratishda error chiqsa:

```bash
# VPS'ga kirish
ssh user@your-vps-ip

# Supplier backend container'ga kirish
docker exec -it supplier-erp-backend-prod sh

# Migration qilish
cd apps/supplier-backend
npx prisma migrate dev --name fix_order_item_quantity
npx prisma generate

# Container'ni restart
exit
docker restart supplier-erp-backend-prod
```

### Yoki manual database fix:

```sql
-- Direct database'ga connect bo'lib:
-- Supabase Dashboard > SQL Editor

-- Supplier backend database'da
ALTER TABLE "OrderItem"
  DROP COLUMN IF EXISTS "quantity",
  ADD COLUMN "ordered_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "confirmed_quantity" INTEGER,
  ADD COLUMN "inbound_quantity" INTEGER,
  ADD COLUMN "pending_quantity" INTEGER;

-- Index'larni update qilish
CREATE INDEX IF NOT EXISTS "OrderItem_tenant_id_idx" ON "OrderItem"("tenant_id");
CREATE INDEX IF NOT EXISTS "OrderItem_order_id_idx" ON "OrderItem"("order_id");
CREATE INDEX IF NOT EXISTS "OrderItem_product_id_idx" ON "OrderItem"("product_id");
```

---

## 🖼️ Image Upload Not Working

### Agar product/logo image save bo'lmasa:

```bash
# Backend log'larni ko'ring
docker logs clinic-erp-backend-prod | grep -i supabase

# Agar "Bucket not found" ko'rsatsa:
cd apps/backend
node scripts/create-supabase-bucket.js production

# Backend'ni restart
docker restart clinic-erp-backend-prod

# Test qiling: image upload page'ga boring va yangi image upload qiling
```

### Agar Supabase URL noto'g'ri bo'lsa:

```bash
# VPS'da .env faylni tekshiring
cat apps/backend/.env | grep SUPABASE

# To'g'ri format:
# SUPABASE_URL=https://xxxxxxxxxx.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## 📧 Email Not Sending

### Quick fix:

```bash
# 1. .env faylni ochish
nano apps/backend/.env

# 3. Backend restart
docker restart clinic-erp-backend-prod

# 4. Test: Member registration qiling, email kelishi kerak
```

---

## 🔄 Container Not Starting

```bash
# Container status ko'rish
docker ps -a

# Agar "Exited" ko'rsatsa, log'ni ko'ring
docker logs clinic-erp-backend-prod --tail 50

# Umumiy muammolar:

# 1. Port busy
sudo lsof -i :3000  # Process'ni topish
sudo kill -9 <PID>  # O'chirish
docker restart clinic-erp-backend-prod

# 2. Environment variable missing
docker exec clinic-erp-backend-prod env | grep NODE_ENV
# Agar NODE_ENV yo'q bo'lsa, .env faylni tekshiring

# 3. Database connection fail
docker exec clinic-erp-backend-prod sh -c "wget -O- http://localhost:3000/monitoring/health"
# Agar timeout bo'lsa, DATABASE_URL'ni tekshiring
```

---

## 💾 Database Connection Error

```bash
# Health check
curl http://localhost:3000/monitoring/health
curl http://localhost:3002/monitoring/health

# Agar database error bo'lsa:
# 1. Supabase status tekshirish: https://status.supabase.com
# 2. Connection string tekshirish:
docker exec clinic-erp-backend-prod sh -c 'echo $DATABASE_URL'

# 3. Prisma regenerate
docker exec clinic-erp-backend-prod sh -c 'cd apps/backend && npx prisma generate'
docker restart clinic-erp-backend-prod
```

---

## 🎯 Frontend Page Not Loading

```bash
# Frontend log'larni ko'rish
docker logs clinic-erp-frontend-prod --tail 50

# API URL tekshirish
docker exec clinic-erp-frontend-prod env | grep NEXT_PUBLIC_API_URL

# To'g'ri bo'lishi kerak:
# NEXT_PUBLIC_API_URL=https://api.jaclit.com

# Rebuild kerak bo'lsa:
docker pull findbeauty/clinic-frontend:latest
docker-compose -f docker-compose.prod.yml up -d frontend
```

---

## 🔐 Login Not Working

### Agar login qilishda error chiqsa:

```bash
# 1. JWT secret tekshirish
docker exec clinic-erp-backend-prod env | grep JWT_SECRET

# 2. Database'da member mavjudligini tekshirish
# Supabase Dashboard > Table Editor > Member table

# 3. Password reset
# Backend log'da "Login failed" error'ni qidiring
docker logs clinic-erp-backend-prod | grep -i "login failed"

# 4. Manual password set (emergency)
# Supabase SQL Editor'da:
UPDATE "Member"
SET "password" = '$2b$10$...' -- bcrypt hash
WHERE "email" = 'admin@example.com';
```

---

## 📊 Monitoring Not Working

```bash
# Prometheus tekshirish
curl http://localhost:9090/-/healthy

# Grafana tekshirish
curl http://localhost:3004/api/health

# Agar ishlamasa:
docker restart prometheus-monitoring
docker restart grafana-monitoring

# Grafana'ga kirish:
# URL: http://your-vps-ip:3004
# User: admin
# Pass: .env faylidagi GRAFANA_ADMIN_PASSWORD
```

---

## 🗄️ Backup & Restore

### Emergency backup:

```bash
# Supabase'dan database dump olish
# Method 1: Supabase Dashboard > Database > Backups > Create backup

# Method 2: pg_dump (agar direct access bo'lsa)
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
psql $DATABASE_URL < backup_20260303_150000.sql
```

---

## 🔧 Quick Restart Commands

```bash
# Barcha servislarni restart
cd /path/to/project
docker-compose -f docker-compose.prod.yml restart

# Faqat backend
docker restart clinic-erp-backend-prod
docker restart supplier-erp-backend-prod

# Faqat frontend
docker restart clinic-erp-frontend-prod
docker restart supplier-erp-frontend-prod

# Full redeploy (yangi code pull qilgandan keyin)
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

---

## 📞 Emergency Rollback

```bash
# Eski version'ga qaytish
docker pull findbeauty/clinic-backend:previous
docker pull findbeauty/clinic-frontend:previous

# Tag'larni ko'rish
docker images | grep findbeauty

# Eski image'ni run qilish
docker-compose -f docker-compose.prod.yml down
# docker-compose.prod.yml da image tag'ni o'zgartiring
docker-compose -f docker-compose.prod.yml up -d
```

---

## 🎯 Quick Health Check Script

```bash
#!/bin/bash
# Faylga saqlang: health-check.sh

echo "🏥 Health Check Starting..."

# Backend
echo -n "Clinic Backend: "
curl -s http://localhost:3000/monitoring/health | grep -q "ok" && echo "✅" || echo "❌"

echo -n "Supplier Backend: "
curl -s http://localhost:3002/monitoring/health | grep -q "ok" && echo "✅" || echo "❌"

# Frontend
echo -n "Clinic Frontend: "
curl -s http://localhost:3001 | grep -q "<!DOCTYPE" && echo "✅" || echo "❌"

echo -n "Supplier Frontend: "
curl -s http://localhost:3003 | grep -q "<!DOCTYPE" && echo "✅" || echo "❌"

# Database
echo -n "Database Connection: "
docker exec clinic-erp-backend-prod sh -c 'cd apps/backend && npx prisma db execute --stdin <<< "SELECT 1"' 2>/dev/null && echo "✅" || echo "❌"

echo "Done!"
```

Ishga tushirish:

```bash
chmod +x health-check.sh
./health-check.sh
```

---

## 🐛 Common Error Messages & Solutions

| Error                                 | Sabab                         | Yechim                                              |
| ------------------------------------- | ----------------------------- | --------------------------------------------------- |
| `Bucket not found`                    | Supabase bucket yaratilmagan  | `node scripts/create-supabase-bucket.js production` |
| `Null constraint violation: quantity` | OrderItem schema mismatch     | Migration script yuqorida ⬆️                        |
| `JWT malformed`                       | Token invalid                 | Frontend cache clear, logout/login                  |
| `CORS error`                          | Frontend URL whitelisted emas | `.env` da `CORS_ORIGINS` tekshiring                 |
| `Port already in use`                 | Port band                     | `sudo lsof -i :3000` va `kill -9 <PID>`             |
| `Connection timeout`                  | Database unreachable          | Supabase status tekshirish                          |
| `Image not loading`                   | Supabase URL wrong            | Frontend'da `getImageUrl` funksiyasi                |

---

## 📱 Telegram Alert Setup

```bash
# .env da:
TELEGRAM_BOT_TOKEN=8242322456:AAHE9IWq4VqI6bM8Pwt_pXgS-OeO3p3SVg4
TELEGRAM_CHAT_ID=-5088123890
ENABLE_TELEGRAM_NOTIFICATIONS=true

# Test qilish:
curl -X POST http://localhost:3000/monitoring/test-notification

# Telegram'da notification kelishi kerak
```

---

## ⚡ Performance Tips

```bash
# 1. Database cache clear (agar slow bo'lsa)
docker exec -it clinic-erp-backend-prod sh
cd apps/backend
npx prisma db execute --stdin <<< "VACUUM ANALYZE;"

# 2. Docker prune (disk space tozalash)
docker system prune -af
docker volume prune -f

# 3. Nginx cache clear (agar proxy ishlatilsa)
sudo nginx -s reload
```

---

## 📝 Logs Location

```bash
# Real-time monitoring
docker logs -f clinic-erp-backend-prod
docker logs -f supplier-erp-backend-prod

# Last 100 lines
docker logs --tail 100 clinic-erp-backend-prod

# Error'larni filter qilish
docker logs clinic-erp-backend-prod 2>&1 | grep -i error

# Save to file
docker logs clinic-erp-backend-prod > backend-logs-$(date +%Y%m%d).log
```

---

**ESLATMA:** Agar yuqoridagi yechimlar ishlamasa, to'liq hujjatni ko'ring: `PRODUCTION_READINESS_CHECKLIST.md`
