# PostgreSQL Exporter Setup Guide

## ✅ Qo'shilgan O'zgarishlar

1. ✅ `docker-compose.prod.yml` ga PostgreSQL Exporter qo'shildi
2. ✅ `prometheus/prometheus.yml` ga PostgreSQL Exporter scrape config qo'shildi

## 📋 Keyingi Qadamlar

### Step 1: Supabase Connection String'ni Topish

1. Supabase Dashboard'ga kiring: https://supabase.com/dashboard
2. Project'ni tanlang
3. **Settings** → **Database** ga o'ting
4. **Connection string** bo'limida **URI** format'ini tanlang
5. Connection string'ni ko'ring (masalan):
   ```
   postgresql://postgres:YOUR_PASSWORD@db.abcdefghijklmnop.supabase.co:5432/postgres
   ```

### Step 2: Environment Variable Qo'shish

EC2'da `.env` faylini yarating yoki mavjud `.env` fayliga quyidagilarni qo'shing:

```bash
# PostgreSQL Exporter (Supabase Database Monitoring)
POSTGRES_EXPORTER_DATA_SOURCE_NAME=postgresql://postgres:YOUR_PASSWORD@YOUR_SUPABASE_HOST:5432/postgres?sslmode=require
```

**⚠️ MUHIM:**
- `YOUR_PASSWORD` ni Supabase database password'iga almashtiring
- `YOUR_SUPABASE_HOST` ni Supabase host'iga almashtiring (masalan: `db.abcdefghijklmnop.supabase.co`)
- Agar Supabase connection pooler ishlatayotgan bo'lsangiz, port `6543` va `?pgbouncer=true` qo'shing:
  ```
  POSTGRES_EXPORTER_DATA_SOURCE_NAME=postgresql://postgres:YOUR_PASSWORD@YOUR_SUPABASE_HOST:6543/postgres?pgbouncer=true&sslmode=require
  ```

### Step 3: EC2'da Container'larni Ishga Tushirish

```bash
# EC2'ga SSH qiling
ssh -i /path/to/your-key.pem ubuntu@your-ec2-ip

# Project directory'ga o'ting
cd ~/clinic-erp

# .env faylini yarating yoki yangilang
nano .env
# Yoki
echo 'POSTGRES_EXPORTER_DATA_SOURCE_NAME=postgresql://postgres:YOUR_PASSWORD@YOUR_SUPABASE_HOST:5432/postgres?sslmode=require' >> .env

# PostgreSQL Exporter'ni ishga tushirish
docker compose -f docker-compose.prod.yml up -d postgres-exporter

# Prometheus'ni restart qilish (yangi config uchun)
docker compose -f docker-compose.prod.yml restart prometheus

# Container'lar ishlayotganini tekshirish
docker ps | grep postgres-exporter
```

### Step 4: Tekshirish

```bash
# PostgreSQL Exporter metrics'larini ko'rish
curl http://localhost:9187/metrics | head -20

# Prometheus'da postgres metrics'larini ko'rish
curl "http://localhost:9090/api/v1/query?query=pg_database_size_bytes"

# Prometheus target status'ini tekshirish
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="database")'
```

Yoki browser'da:
```
http://your-ec2-ip:9090/targets
```

`postgres-exporter` target **UP** bo'lishi kerak.

### Step 5: Grafana'da Database Dashboard Yaratish

Grafana'ga kiring: `http://your-ec2-ip:3004`

**Dashboard'da quyidagi panel'lar:**

1. **Active Connections:**
   - Query: `pg_stat_database_numbackends{datname="postgres"}`
   - Visualization: Stat
   - Unit: None

2. **Database Size:**
   - Query: `pg_database_size_bytes{datname="postgres"} / 1024 / 1024 / 1024`
   - Visualization: Gauge
   - Unit: GB
   - Thresholds: Green < 6.4GB (80%), Yellow 6.4-7.2GB, Red > 7.2GB (90%)

3. **Cache Hit Ratio:**
   - Query: `sum(rate(pg_stat_database_blks_hit{datname="postgres"}[5m])) / (sum(rate(pg_stat_database_blks_hit{datname="postgres"}[5m])) + sum(rate(pg_stat_database_blks_read{datname="postgres"}[5m]))) * 100`
   - Visualization: Gauge
   - Unit: Percent
   - Thresholds: Green > 95%, Yellow 90-95%, Red < 90%

## ✅ Tekshirish Checklist

- [ ] `.env` faylida `POSTGRES_EXPORTER_DATA_SOURCE_NAME` qo'shilgan
- [ ] PostgreSQL Exporter container ishlayapti
- [ ] Prometheus'da postgres metrics'lar ko'rinadi
- [ ] Grafana'da database dashboard yaratilgan

## 🐛 Muammo Hal Qilish

### PostgreSQL Exporter ishlamayapti

1. Container log'larini tekshiring:
   ```bash
   docker logs postgres-exporter
   ```

2. Connection string'ni tekshiring:
   ```bash
   docker exec postgres-exporter env | grep DATA_SOURCE_NAME
   ```

3. Supabase connection'ni test qiling:
   ```bash
   # Supabase'ga to'g'ridan-to'g'ri ulanishni test qilish
   psql "postgresql://postgres:YOUR_PASSWORD@YOUR_SUPABASE_HOST:5432/postgres?sslmode=require"
   ```

### Prometheus'da metrics ko'rinmayapti

1. Prometheus target status'ini tekshiring:
   ```
   http://your-ec2-ip:9090/targets
   ```

2. Prometheus log'larini tekshiring:
   ```bash
   docker logs prometheus-monitoring | grep -i postgres
   ```

3. PostgreSQL Exporter metrics'larini to'g'ridan-to'g'ri tekshiring:
   ```bash
   curl http://localhost:9187/metrics | grep pg_stat_database
   ```

