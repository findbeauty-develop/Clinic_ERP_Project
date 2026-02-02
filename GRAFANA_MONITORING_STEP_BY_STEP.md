# 📊 Grafana Monitoring Setup - Bosqichma-Bosqich Qo'llanma

> **Maqsad:** Production'da to'liq monitoring tizimini bosqichma-bosqich qurish  
> **Vaqt:** Har bir bosqichdan keyin test qilish va keyingi bosqichga o'tish

---

## 📋 Umumiy Ko'rinish

**Jami vaqt:** 3-4 kun (agar kuniga 4-6 soat ishlatsangiz)  
**Bosqichlar:** 4 ta asosiy bosqich  
**Check qilish:** Har bir bosqichdan keyin test qilish majburiy

---

## ✅ Bosqich 1: Asosiy Infrastructure Monitoring (EC2 Server)

**Vaqt:** 2-3 soat  
**Qiyinchilik:** ⭐⭐ (Oson)  
**Maqsad:** EC2 server'ning CPU, RAM, Disk, Network metrics'larini ko'rish

### Step 1.1: Docker Compose'ga Prometheus va Node Exporter qo'shish

**Fayl:** `docker-compose.prod.yml`

**Qo'shish kerak:**
```yaml
services:
  # ... mavjud servislar

  # Prometheus (Metrics Database)
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    networks:
      - clinic-erp-network

  # Node Exporter (Server Metrics)
  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    restart: unless-stopped
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    networks:
      - clinic-erp-network

volumes:
  prometheus-data:  # Qo'shing (agar yo'q bo'lsa)
```

### Step 1.2: Prometheus Configuration File Yaratish

**Fayl:** `prometheus/prometheus.yml` (yangi fayl yaratish)

**Icerik:**
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # Node Exporter (Server Metrics)
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
        labels:
          instance: 'ec2-server'
```

### Step 1.3: Grafana'ni Docker Compose'ga Qo'shish

**Fayl:** `docker-compose.prod.yml`

**Qo'shish kerak:**
```yaml
  # Grafana (Visualization)
  grafana:
    image: grafana/grafana:latest
    container_name: grafana-monitoring
    restart: unless-stopped
    ports:
      - "3004:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-admin123}
      - GF_INSTALL_PLUGINS=grafana-clock-panel
    volumes:
      - grafana-data:/var/lib/grafana
      - grafana-provisioning:/etc/grafana/provisioning
    networks:
      - clinic-erp-network
    depends_on:
      - prometheus

volumes:
  grafana-data:  # Qo'shing
  grafana-provisioning:  # Qo'shing
```

### Step 1.4: EC2'da Deployment

**EC2'da SSH orqali:**

```bash
# 1. Project directory'ga o'ting
cd ~/clinic-erp

# 2. Prometheus directory yaratish
mkdir -p prometheus

# 3. prometheus.yml faylini yuklash (local'dan SCP orqali)
# yoki manual yaratish

# 4. Container'larni ishga tushirish
docker compose -f docker-compose.prod.yml up -d prometheus node-exporter grafana

# 5. Container'lar ishlayotganini tekshirish
docker ps | grep -E "prometheus|node-exporter|grafana"
```

### Step 1.5: Security Group'da Portlar Ochish

**AWS Console'da:**
- Port 9090: Prometheus
- Port 9100: Node Exporter (faqat internal)
- Port 3004: Grafana

### Step 1.6: Grafana'da Prometheus Data Source Qo'shish

1. Grafana'ga kirish: `http://your-ec2-ip:3004`
2. Login: `admin` / `admin123`
3. Configuration → Data Sources → Add data source
4. Prometheus tanlang
5. URL: `http://prometheus:9090`
6. Save & Test

### Step 1.7: Infrastructure Dashboard Yaratish

**Dashboard'da quyidagi panel'lar:**

1. **CPU Usage:**
   - Query: `100 - (avg(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`
   - Visualization: Stat
   - Unit: Percent (0-100)

2. **RAM Usage:**
   - Query: `(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100`
   - Visualization: Gauge
   - Unit: Percent
   - Thresholds: Green < 70%, Yellow 70-90%, Red > 90%

3. **Disk Usage:**
   - Query: `100 - ((node_filesystem_avail_bytes{mountpoint="/"} * 100) / node_filesystem_size_bytes{mountpoint="/"})`
   - Visualization: Gauge
   - Unit: Percent
   - Thresholds: Green < 70%, Yellow 70-90%, Red > 90%

4. **Load Average:**
   - Query: `node_load1`
   - Visualization: Graph
   - Unit: None

### Step 1.8: Alerting Sozlash

**Alert Rule 1: High Disk Usage**
- Condition: Disk usage > 80%
- Evaluation: Every 5 minutes
- Notification: Email channel

**Alert Rule 2: High RAM Usage**
- Condition: RAM usage > 90%
- Evaluation: Every 5 minutes
- Notification: Email channel

### ✅ CHECK: Bosqich 1 Test

**Tekshirish:**
```bash
# 1. Prometheus ishlayotganini tekshirish
curl http://localhost:9090/api/v1/query?query=up

# 2. Node Exporter metrics'larini ko'rish
curl http://localhost:9100/metrics | head -20

# 3. Grafana'da dashboard'ni ochib, metrics'lar ko'rinayotganini tekshirish
# 4. Alert'ni test qilish (disk usage oshirib ko'rish)
```

**Kutilgan natija:**
- ✅ Prometheus'da node-exporter metrics'lar ko'rinadi
- ✅ Grafana'da CPU, RAM, Disk ko'rsatiladi
- ✅ Alert email keladi (test qilganda)

**Keyingi bosqichga o'tish:** Faqat yuqoridagilar ishlagandan keyin

---

## ✅ Bosqich 2: Database Monitoring (Postgres/Supabase)

**Vaqt:** 3-4 soat  
**Qiyinchilik:** ⭐⭐⭐ (O'rtacha)  
**Maqsad:** Database connections, size, slow queries, cache hit ratio'ni monitoring qilish

### Step 2.1: PostgreSQL Exporter Qo'shish

**Fayl:** `docker-compose.prod.yml`

**Qo'shish kerak:**
```yaml
  # PostgreSQL Exporter (Database Metrics)
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    container_name: postgres-exporter
    restart: unless-stopped
    environment:
      - DATA_SOURCE_NAME=postgresql://postgres:YOUR_PASSWORD@YOUR_SUPABASE_HOST:5432/postgres?sslmode=require
    ports:
      - "9187:9187"
    networks:
      - clinic-erp-network
```

**⚠️ MUHIM:** `DATA_SOURCE_NAME` da Supabase connection string'ni to'g'ri qo'ying.

### Step 2.2: Prometheus Configuration'ga PostgreSQL Exporter Qo'shish

**Fayl:** `prometheus/prometheus.yml`

**Qo'shish kerak:**
```yaml
scrape_configs:
  # ... mavjud node-exporter

  # PostgreSQL Exporter (DB Metrics)
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter:9187']
        labels:
          instance: 'supabase-database'
```

### Step 2.3: Container'ni Ishga Tushirish

```bash
# EC2'da
docker compose -f docker-compose.prod.yml up -d postgres-exporter

# Prometheus'ni restart qilish (yangi config uchun)
docker compose -f docker-compose.prod.yml restart prometheus
```

### Step 2.4: Grafana'da Database Dashboard Yaratish

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

4. **Slow Queries:**
   - Query: `pg_stat_statements_mean_exec_time`
   - Visualization: Table
   - Unit: Seconds

5. **Top 5 Largest Tables:**
   - Query: Custom SQL (Grafana'da PostgreSQL data source orqali)
   ```sql
   SELECT 
     nspname || '.' || relname AS "Table",
     pg_total_relation_size(c.oid) / (1024*1024) AS "Size (MB)"
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE nspname = 'public' 
     AND c.relkind = 'r'
   ORDER BY pg_total_relation_size(c.oid) DESC
   LIMIT 5
   ```

### Step 2.5: Database Alerting Sozlash

**Alert Rule 1: Database Size Warning**
- Condition: Database size > 6.4GB (80%)
- Evaluation: Every 5 minutes
- Notification: Email + Telegram

**Alert Rule 2: High Connections**
- Condition: Active connections > 180 (90% of 200)
- Evaluation: Every 5 minutes
- Notification: Email

**Alert Rule 3: Low Cache Hit Ratio**
- Condition: Cache hit ratio < 90%
- Evaluation: Every 5 minutes
- Notification: Email

### ✅ CHECK: Bosqich 2 Test

**Tekshirish:**
```bash
# 1. PostgreSQL Exporter ishlayotganini tekshirish
curl http://localhost:9187/metrics | grep pg_stat_database

# 2. Prometheus'da postgres metrics'larini ko'rish
curl "http://localhost:9090/api/v1/query?query=pg_database_size_bytes"

# 3. Grafana'da database dashboard'ni ochib, metrics'lar ko'rinayotganini tekshirish
# 4. Alert'ni test qilish
```

**Kutilgan natija:**
- ✅ PostgreSQL Exporter metrics'lar ko'rinadi
- ✅ Grafana'da database size, connections ko'rsatiladi
- ✅ Alert email keladi (test qilganda)

**Keyingi bosqichga o'tish:** Faqat yuqoridagilar ishlagandan keyin

---

## ✅ Bosqich 3: Backend API Monitoring

**Vaqt:** 4-5 soat  
**Qiyinchilik:** ⭐⭐⭐ (O'rtacha)  
**Maqsad:** API request rate, error rate, response time'ni monitoring qilish

### Step 3.1: NestJS'ga Prometheus Package Qo'shish

**Fayl:** `apps/backend/package.json`

**Qo'shish kerak:**
```json
{
  "dependencies": {
    "@willsoto/nestjs-prometheus": "^5.0.0",
    "prom-client": "^15.0.0"
  }
}
```

**Install qilish:**
```bash
cd apps/backend
pnpm install @willsoto/nestjs-prometheus prom-client
```

### Step 3.2: Prometheus Module Yaratish

**Fayl:** `apps/backend/src/common/prometheus.module.ts` (yangi fayl)

**Icerik:**
```typescript
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
      defaultLabels: {
        app: 'clinic-erp-backend',
      },
    }),
  ],
  exports: [PrometheusModule],
})
export class CommonPrometheusModule {}
```

### Step 3.3: App Module'ga Qo'shish

**Fayl:** `apps/backend/src/app.module.ts`

**Qo'shish kerak:**
```typescript
import { CommonPrometheusModule } from './common/prometheus.module';

@Module({
  imports: [
    // ... mavjud imports
    CommonPrometheusModule,
  ],
})
```

### Step 3.4: Metrics Endpoint Yaratish

**Fayl:** `apps/backend/src/common/controllers/metrics.controller.ts` (yangi fayl)

**Icerik:**
```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrometheusController } from '@willsoto/nestjs-prometheus';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController extends PrometheusController {}
```

### Step 3.5: HTTP Request Metrics Qo'shish

**Fayl:** `apps/backend/src/common/interceptors/prometheus.interceptor.ts` (yangi fayl)

**Icerik:**
```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Counter, Histogram } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
});

@Injectable()
export class PrometheusInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, route } = request;
    const routePath = route?.path || 'unknown';

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (Date.now() - startTime) / 1000;
          httpRequestDuration.observe({ method, route: routePath }, duration);
          httpRequestsTotal.inc({
            method,
            route: routePath,
            status: response.statusCode,
          });
        },
        error: () => {
          const duration = (Date.now() - startTime) / 1000;
          httpRequestDuration.observe({ method, route: routePath }, duration);
          httpRequestsTotal.inc({
            method,
            route: routePath,
            status: response.statusCode || 500,
          });
        },
      })
    );
  }
}
```

### Step 3.6: Global Interceptor Qo'shish

**Fayl:** `apps/backend/src/app.module.ts`

**Qo'shish kerak:**
```typescript
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrometheusInterceptor } from './common/interceptors/prometheus.interceptor';

@Module({
  providers: [
    // ... mavjud providers
    {
      provide: APP_INTERCEPTOR,
      useClass: PrometheusInterceptor,
    },
  ],
})
```

### Step 3.7: Prometheus Configuration'ga Backend Qo'shish

**Fayl:** `prometheus/prometheus.yml`

**Qo'shish kerak:**
```yaml
scrape_configs:
  # ... mavjud configs

  # Backend API Metrics
  - job_name: 'backend'
    static_configs:
      - targets: ['backend:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Step 3.8: Grafana'da API Dashboard Yaratish

**Dashboard'da quyidagi panel'lar:**

1. **Request Rate (RPS):**
   - Query: `rate(http_requests_total[1m])`
   - Visualization: Graph
   - Unit: req/s

2. **Error Rate:**
   - Query: `rate(http_requests_total{status=~"5.."}[5m])`
   - Visualization: Graph
   - Unit: req/s

3. **Response Time (p95):**
   - Query: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`
   - Visualization: Graph
   - Unit: Seconds

4. **Response Time (p99):**
   - Query: `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))`
   - Visualization: Graph
   - Unit: Seconds

5. **Status Code Distribution:**
   - Query: `sum(rate(http_requests_total[5m])) by (status)`
   - Visualization: Pie Chart

### Step 3.9: API Alerting Sozlash

**Alert Rule 1: High Error Rate**
- Condition: Error rate > 10 req/s
- Evaluation: Every 5 minutes
- Notification: Email + Telegram

**Alert Rule 2: Slow Response Time**
- Condition: p95 response time > 2 seconds
- Evaluation: Every 5 minutes
- Notification: Email

### ✅ CHECK: Bosqich 3 Test

**Tekshirish:**
```bash
# 1. Backend metrics endpoint'ni tekshirish
curl http://localhost:3000/metrics | head -20

# 2. Prometheus'da backend metrics'larini ko'rish
curl "http://localhost:9090/api/v1/query?query=http_requests_total"

# 3. Bir nechta API request yuborish
curl http://localhost:3000/health
curl http://localhost:3000/monitoring/health

# 4. Grafana'da API dashboard'ni ochib, metrics'lar ko'rinayotganini tekshirish
# 5. Alert'ni test qilish
```

**Kutilgan natija:**
- ✅ `/metrics` endpoint ishlaydi
- ✅ Prometheus'da backend metrics'lar ko'rinadi
- ✅ Grafana'da request rate, error rate ko'rsatiladi
- ✅ Alert email keladi (test qilganda)

**Keyingi bosqichga o'tish:** Faqat yuqoridagilar ishlagandan keyin

---

## ✅ Bosqich 4: Storage va Business Metrics

**Vaqt:** 4-5 soat  
**Qiyinchilik:** ⭐⭐⭐⭐ (Qiyin)  
**Maqsad:** Supabase storage va business metrics'larini monitoring qilish

### Step 4.1: Storage Metrics Endpoint Yaratish

**Fayl:** `apps/backend/src/common/controllers/metrics.controller.ts`

**Qo'shish kerak:**
```typescript
import { Gauge } from 'prom-client';

const databaseSizeGB = new Gauge({
  name: 'database_size_gb',
  help: 'Database size in GB',
});

@Get('storage-size')
async getStorageSize() {
  // Hozirgi monitoring.service.ts'dagi getDatabaseSizeInfo() metodini chaqirish
  const info = await this.monitoringService.getDatabaseSizeInfo();
  
  // Prometheus metric'ni yangilash
  databaseSizeGB.set(info.sizeGB);
  
  return info;
}
```

### Step 4.2: Business Metrics Endpoint Yaratish

**Fayl:** `apps/backend/src/common/controllers/metrics.controller.ts`

**Qo'shish kerak:**
```typescript
import { Gauge, Counter } from 'prom-client';

const activeUsers = new Gauge({
  name: 'active_users_total',
  help: 'Total active users',
});

const dailySignups = new Counter({
  name: 'daily_signups_total',
  help: 'Total daily signups',
});

@Get('business-metrics')
async getBusinessMetrics() {
  // Database'dan ma'lumot olish
  const activeUsersCount = await this.prisma.member.count({
    where: { /* active users condition */ }
  });
  
  activeUsers.set(activeUsersCount);
  
  return { activeUsers: activeUsersCount };
}
```

### Step 4.3: Grafana'da Storage Dashboard Yaratish

**Dashboard'da quyidagi panel'lar:**

1. **Database Size Trend:**
   - Query: `database_size_gb`
   - Visualization: Graph
   - Unit: GB

2. **Storage Usage Percentage:**
   - Query: `(database_size_gb / 8) * 100` (8GB = plan limit)
   - Visualization: Gauge
   - Unit: Percent
   - Thresholds: Green < 80%, Yellow 80-90%, Red > 90%

### Step 4.4: Grafana'da Business Dashboard Yaratish

**Dashboard'da quyidagi panel'lar:**

1. **Active Users:**
   - Query: `active_users_total`
   - Visualization: Stat
   - Unit: None

2. **Daily Signups:**
   - Query: `rate(daily_signups_total[24h])`
   - Visualization: Graph
   - Unit: users/day

### ✅ CHECK: Bosqich 4 Test

**Tekshirish:**
```bash
# 1. Storage metrics endpoint'ni tekshirish
curl http://localhost:3000/metrics/storage-size

# 2. Business metrics endpoint'ni tekshirish
curl http://localhost:3000/metrics/business-metrics

# 3. Prometheus'da metrics'larini ko'rish
curl "http://localhost:9090/api/v1/query?query=database_size_gb"

# 4. Grafana'da dashboard'larni ochib, metrics'lar ko'rinayotganini tekshirish
```

**Kutilgan natija:**
- ✅ Storage metrics endpoint ishlaydi
- ✅ Business metrics endpoint ishlaydi
- ✅ Grafana'da storage va business metrics ko'rsatiladi

**Keyingi bosqichga o'tish:** Faqat yuqoridagilar ishlagandan keyin

---

## ✅ Bosqich 5: Security va Cost Monitoring (Ixtiyoriy)

**Vaqt:** 3-4 soat  
**Qiyinchilik:** ⭐⭐⭐ (O'rtacha)  
**Maqsad:** Security events va cost tracking

### Step 5.1: Security Metrics Qo'shish

**Fayl:** `apps/backend/src/common/interceptors/security.interceptor.ts` (yangi fayl)

**Icerik:**
```typescript
import { Counter } from 'prom-client';

const failedLogins = new Counter({
  name: 'failed_login_attempts_total',
  help: 'Total failed login attempts',
  labelNames: ['ip'],
});

// Login endpoint'da ishlatish
```

### Step 5.2: Cost Monitoring Dashboard

**Grafana'da:**
- Storage growth rate (GB/day)
- Projection: "10 kunda limitga yetadi" alert

### ✅ CHECK: Bosqich 5 Test

**Tekshirish:**
- Security metrics ko'rinadi
- Cost projection ishlaydi

---

## 📊 Umumiy Checklist

### Bosqich 1: Infrastructure ✅
- [ ] Prometheus o'rnatildi
- [ ] Node Exporter o'rnatildi
- [ ] Grafana o'rnatildi
- [ ] Prometheus data source qo'shildi
- [ ] Infrastructure dashboard yaratildi
- [ ] Alerting sozlandi
- [ ] Test qilindi va ishlayapti

### Bosqich 2: Database ✅
- [ ] PostgreSQL Exporter o'rnatildi
- [ ] Prometheus config yangilandi
- [ ] Database dashboard yaratildi
- [ ] Database alerting sozlandi
- [ ] Test qilindi va ishlayapti

### Bosqich 3: Backend API ✅
- [ ] Prometheus package qo'shildi
- [ ] Metrics endpoint yaratildi
- [ ] HTTP interceptor qo'shildi
- [ ] API dashboard yaratildi
- [ ] API alerting sozlandi
- [ ] Test qilindi va ishlayapti

### Bosqich 4: Storage & Business ✅
- [ ] Storage metrics endpoint yaratildi
- [ ] Business metrics endpoint yaratildi
- [ ] Storage dashboard yaratildi
- [ ] Business dashboard yaratildi
- [ ] Test qilindi va ishlayapti

### Bosqich 5: Security & Cost (Ixtiyoriy) ✅
- [ ] Security metrics qo'shildi
- [ ] Cost monitoring dashboard yaratildi
- [ ] Test qilindi va ishlayapti

---

## 🚨 Muhim Eslatmalar

1. **Har bir bosqichdan keyin test qilish majburiy**
2. **Agar biror narsa ishlamasa, keyingi bosqichga o'tmang**
3. **Production'ga deploy qilishdan oldin barcha testlarni o'tkazish kerak**
4. **Alerting'ni test qilish uchun threshold'larni vaqtincha past qo'ying**

---

## 📝 Deployment Qadamlari

### EC2'da Deployment:

```bash
# 1. Docker Compose faylini yangilash
cd ~/clinic-erp
# docker-compose.prod.yml'ni yangilash

# 2. Prometheus config yuklash
mkdir -p prometheus
# prometheus.yml'ni yuklash

# 3. Container'larni ishga tushirish
docker compose -f docker-compose.prod.yml up -d prometheus node-exporter grafana

# 4. Log'larni tekshirish
docker logs -f prometheus
docker logs -f grafana-monitoring
```

---

## 🔧 Troubleshooting

### Prometheus metrics ko'rinmayapti:
- Prometheus config'ni tekshiring
- Container'lar ishlayotganini tekshiring: `docker ps`
- Prometheus UI'da targets'ni tekshiring: `http://localhost:9090/targets`

### Grafana'da data ko'rinmayapti:
- Data source connection'ni tekshiring
- Query syntax'ni tekshiring
- Time range'ni to'g'ri tanlang

### Alert email kelmayapti:
- SMTP sozlamalarini tekshiring
- Notification channel'ni test qiling
- Alert rule condition'ni tekshiring

---

## 📚 Foydali Linklar

- Grafana Documentation: https://grafana.com/docs/
- Prometheus Documentation: https://prometheus.io/docs/
- Node Exporter: https://github.com/prometheus/node_exporter
- PostgreSQL Exporter: https://github.com/prometheus-community/postgres_exporter

---

**Oxirgi yangilanish:** 2025-01-30  
**Status:** Bosqichma-bosqich qo'llanma tayyor

