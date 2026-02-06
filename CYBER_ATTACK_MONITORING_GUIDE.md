# 🛡️ Cyber Attack Monitoring Guide

Bu guide Grafana'da kiber xujumlarni monitoring qilish uchun to'liq yo'riqnoma.

## 📋 Tarkib

1. [O'rnatish](#ornatish)
2. [Environment Variables](#environment-variables)
3. [Prometheus Metrics](#prometheus-metrics)
4. [Grafana Dashboard](#grafana-dashboard)
5. [Test Qilish](#test-qilish)
6. [Alerting](#alerting)

---

## 🔧 O'rnatish

### 1. Backend'ni qayta ishga tushiring

```bash
# VPS'da
cd ~/clinic-erp
docker-compose -f docker-compose.prod.yml restart backend
```

### 2. Metrics'ni tekshiring

```bash
# Backend metrics endpoint'ini tekshiring
curl http://localhost:3000/metrics | grep cyber_attack

# Quyidagi metrics'lar ko'rinishi kerak:
# - cyber_attacks_total
# - cyber_attack_rate_per_minute
# - active_cyber_attacks
# - suspicious_ips_count
```

---

## 🔐 Environment Variables

`.env` yoki `.env.production` fayliga quyidagi o'zgaruvchilarni qo'shing:

```bash
# Attack Detection Configuration
ATTACK_BRUTE_FORCE_THRESHOLD=5          # 5 failed logins = brute force
ATTACK_BRUTE_FORCE_WINDOW=900000        # 15 minutes (milliseconds)
ATTACK_DDOS_THRESHOLD=100               # 100 requests = DDoS
ATTACK_DDOS_WINDOW=60000                # 1 minute (milliseconds)
ATTACK_CLEANUP_INTERVAL=3600000         # 1 hour (milliseconds)
```

---

## 📊 Prometheus Metrics

### Available Metrics

1. **`cyber_attacks_total`** - Jami aniqlangan xujumlar soni
   - Labels: `attack_type`, `severity`, `ip`
   - Types: `brute_force`, `ddos`, `sql_injection`, `xss`, `path_traversal`, `unauthorized_access`, `suspicious_user_agent`

2. **`cyber_attack_rate_per_minute`** - Daqiqada xujumlar soni
   - Labels: `attack_type`

3. **`active_cyber_attacks`** - Oxirgi 5 daqiqada faol xujumlar
   - Labels: `attack_type`, `severity`

4. **`suspicious_ips_count`** - Shubhali IP'lar soni
   - Labels: `attack_type`

### Query Examples

```promql
# Jami xujumlar soni
sum(cyber_attacks_total)

# Brute force xujumlar
sum(cyber_attacks_total{attack_type="brute_force"})

# DDoS xujumlar
sum(cyber_attacks_total{attack_type="ddos"})

# SQL injection xujumlar
sum(cyber_attacks_total{attack_type="sql_injection"})

# Faol xujumlar (oxirgi 5 daqiqada)
sum(active_cyber_attacks)

# Eng ko'p xujum qilgan IP'lar (top 10)
topk(10, sum by (ip) (cyber_attacks_total))

# Xujumlar rate (daqiqada)
rate(cyber_attacks_total[5m]) * 60
```

---

## 📈 Grafana Dashboard

### Dashboard Yaratish

1. **Grafana'ga kirish**
   - URL: `http://YOUR_VPS_IP:3004`
   - Login: `admin` / `admin123`

2. **Yangi Dashboard yaratish**
   - Dashboards → New → New Dashboard
   - Dashboard nomi: "Cyber Attack Monitoring"

### Panel'lar

#### Panel 1: Total Cyber Attacks
- **Visualization**: Stat
- **Query**:
  ```promql
  sum(cyber_attacks_total)
  ```
- **Title**: "Total Cyber Attacks"
- **Unit**: None
- **Color**: Red

#### Panel 2: Attacks by Type
- **Visualization**: Pie Chart
- **Query**:
  ```promql
  sum by (attack_type) (cyber_attacks_total)
  ```
- **Title**: "Attacks by Type"
- **Legend**: Show as table

#### Panel 3: Active Attacks (Last 5 minutes)
- **Visualization**: Stat
- **Query**:
  ```promql
  sum(active_cyber_attacks)
  ```
- **Title**: "Active Attacks (5 min)"
- **Unit**: None
- **Color**: Orange
- **Thresholds**: 
  - Green: < 1
  - Yellow: 1-5
  - Red: > 5

#### Panel 4: Attack Rate (per minute)
- **Visualization**: Time Series
- **Query**:
  ```promql
  rate(cyber_attacks_total[5m]) * 60
  ```
- **Title**: "Attack Rate (per minute)"
- **Unit**: req/min
- **Legend**: `{{attack_type}}`

#### Panel 5: Attacks by Severity
- **Visualization**: Bar Chart
- **Query**:
  ```promql
  sum by (severity) (cyber_attacks_total)
  ```
- **Title**: "Attacks by Severity"
- **Legend**: Show as table

#### Panel 6: Top 10 Attacking IPs
- **Visualization**: Table
- **Query**:
  ```promql
  topk(10, sum by (ip) (cyber_attacks_total))
  ```
- **Title**: "Top 10 Attacking IPs"
- **Format**: Table
- **Columns**: IP, Count

#### Panel 7: Brute Force Attacks
- **Visualization**: Time Series
- **Query**:
  ```promql
  sum(cyber_attacks_total{attack_type="brute_force"})
  ```
- **Title**: "Brute Force Attacks"
- **Unit**: None

#### Panel 8: DDoS Attacks
- **Visualization**: Time Series
- **Query**:
  ```promql
  sum(cyber_attacks_total{attack_type="ddos"})
  ```
- **Title**: "DDoS Attacks"
- **Unit**: None

#### Panel 9: SQL Injection Attacks
- **Visualization**: Time Series
- **Query**:
  ```promql
  sum(cyber_attacks_total{attack_type="sql_injection"})
  ```
- **Title**: "SQL Injection Attacks"
- **Unit**: None

#### Panel 10: XSS Attacks
- **Visualization**: Time Series
- **Query**:
  ```promql
  sum(cyber_attacks_total{attack_type="xss"})
  ```
- **Title**: "XSS Attacks"
- **Unit**: None

#### Panel 11: Suspicious IPs Count
- **Visualization**: Stat
- **Query**:
  ```promql
  max(suspicious_ips_count)
  ```
- **Title**: "Suspicious IPs"
- **Unit**: None
- **Color**: Red

#### Panel 12: Attack Timeline
- **Visualization**: Time Series
- **Query**:
  ```promql
  sum by (attack_type) (cyber_attacks_total)
  ```
- **Title**: "Attack Timeline"
- **Unit**: None
- **Legend**: `{{attack_type}}`

---

## 🧪 Test Qilish

### 1. Brute Force Test

```bash
# Noto'g'ri parol bilan 6 marta login urinish
for i in {1..6}; do
  curl -X POST http://localhost:3000/iam/members/login \
    -H "Content-Type: application/json" \
    -d '{"memberId":"test","password":"wrong"}'
  sleep 1
done
```

**Kutilgan natija**: `cyber_attacks_total{attack_type="brute_force"}` oshishi kerak

### 2. SQL Injection Test

```bash
curl "http://localhost:3000/api/products?search=' OR '1'='1"
```

**Kutilgan natija**: `cyber_attacks_total{attack_type="sql_injection"}` oshishi kerak

### 3. XSS Test

```bash
curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"name":"<script>alert(1)</script>"}'
```

**Kutilgan natija**: `cyber_attacks_total{attack_type="xss"}` oshishi kerak

### 4. Path Traversal Test

```bash
curl "http://localhost:3000/api/files/../../../etc/passwd"
```

**Kutilgan natija**: `cyber_attacks_total{attack_type="path_traversal"}` oshishi kerak

### 5. DDoS Test

```bash
# 100+ request bir daqiqada
for i in {1..150}; do
  curl http://localhost:3000/api/products &
done
wait
```

**Kutilgan natija**: `cyber_attacks_total{attack_type="ddos"}` oshishi kerak

---

## 🚨 Alerting

### Grafana Alert Rules

1. **Critical Attack Alert**
   - Condition: `sum(active_cyber_attacks{severity="critical"}) > 0`
   - Message: "🚨 CRITICAL: Active cyber attack detected!"
   - Notification: Email/Telegram

2. **High Attack Rate Alert**
   - Condition: `rate(cyber_attacks_total[5m]) * 60 > 10`
   - Message: "⚠️ WARNING: High attack rate detected (>10/min)"
   - Notification: Email/Telegram

3. **Brute Force Alert**
   - Condition: `sum(cyber_attacks_total{attack_type="brute_force"}) > 10`
   - Message: "🔒 ALERT: Multiple brute force attempts detected"
   - Notification: Email/Telegram

4. **DDoS Alert**
   - Condition: `sum(cyber_attacks_total{attack_type="ddos"}) > 5`
   - Message: "🌊 ALERT: DDoS attack detected"
   - Notification: Email/Telegram

### Alert Configuration

1. Grafana'da: Alerting → Alert rules → New alert rule
2. Query: Yuqoridagi query'lardan birini tanlang
3. Condition: Threshold o'rnating
4. Notification: Email yoki Telegram channel tanlang

---

## 📝 API Endpoints

### Get IP Statistics

```bash
GET /security/attacks/ip-stats?ip=192.168.1.1
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "ip": "192.168.1.1",
  "statistics": {
    "totalRequests": 150,
    "failedLogins": 8,
    "lastSeen": "2026-02-05T10:30:00.000Z"
  }
}
```

### Health Check

```bash
GET /security/attacks/health
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "service": "attack-detection",
  "status": "operational",
  "timestamp": "2026-02-05T10:30:00.000Z"
}
```

---

## 🔍 Attack Types

| Attack Type | Description | Severity | Detection Method |
|------------|-------------|----------|------------------|
| `brute_force` | Multiple failed login attempts | Medium-High | IP-based tracking |
| `ddos` | Too many requests from same IP | High-Critical | Request rate tracking |
| `sql_injection` | SQL injection patterns in request | High | Pattern matching |
| `xss` | Cross-site scripting patterns | High | Pattern matching |
| `path_traversal` | Path traversal attempts (`../`) | Medium | Pattern matching |
| `unauthorized_access` | 401/403 errors | Medium | Status code tracking |
| `suspicious_user_agent` | Bot/scanner user agents | Low-Medium | User-Agent matching |

---

## 💡 Best Practices

1. **Regular Monitoring**: Dashboard'ni kunlik tekshiring
2. **Alert Tuning**: Alert threshold'larni o'z environment'ingizga moslashtiring
3. **IP Blocking**: Critical attack'larda IP'ni block qiling (fail2ban yoki firewall)
4. **Log Analysis**: Backend log'larini tahlil qiling
5. **Rate Limiting**: DDoS himoyasi uchun rate limiting sozlang

---

## 🐛 Troubleshooting

### Metrics ko'rinmayapti

1. Backend'ni restart qiling
2. Prometheus'da backend target UP ekanligini tekshiring
3. Metrics endpoint'ni tekshiring: `curl http://localhost:3000/metrics | grep cyber`

### Attack aniqlanmayapti

1. Threshold'larni tekshiring (environment variables)
2. Backend log'larini tekshiring: `docker logs backend | grep ATTACK`
3. Attack pattern'larni to'g'ri yozganingizni tekshiring

### Grafana'da "No data"

1. Prometheus data source to'g'ri sozlanganligini tekshiring
2. Time range'ni tekshiring (Last 5 minutes yoki ko'proq)
3. Query syntax'ni tekshiring

---

## 📚 Qo'shimcha Ma'lumot

- [Prometheus Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Alerting](https://grafana.com/docs/grafana/latest/alerting/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

**✅ Tugallandi!** Endi sizda to'liq kiber xujum monitoring tizimi mavjud!

