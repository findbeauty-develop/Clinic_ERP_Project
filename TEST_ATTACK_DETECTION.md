# 🧪 Attack Detection Test Guide

Bu guide attack detection'ni test qilish uchun to'liq yo'riqnoma.

## 📋 Test Qilish

### 1. Brute Force Attack Test

**Sabab**: Brute force detection 5 ta failed login'dan keyin ishga tushadi.

```bash
# VPS'da yoki local'da
# Noto'g'ri parol bilan 6 marta login urinish
for i in {1..6}; do
  curl -X POST http://localhost:3000/iam/members/login \
    -H "Content-Type: application/json" \
    -d '{"memberId":"test","password":"wrong_password"}'
  echo "" # New line
  sleep 1
done

# Keyin metrics'ni tekshiring
curl http://localhost:3000/metrics | grep "brute_force"
```

**Kutilgan natija**: 
```
cyber_attacks_total{attack_type="brute_force",severity="medium",...} 1
```

### 2. SQL Injection Attack Test

**Sabab**: SQL injection URL query string yoki body'da SQL pattern bo'lishi kerak.

```bash
# Test 1: URL query string'da SQL injection (HIRA search endpoint)
curl "http://localhost:3000/hira/search?yadmNm=' OR '1'='1"

# Test 2: Calendar endpoint'da SQL injection
curl "http://localhost:3000/api/calendar/lunar-to-solar?year=' OR '1'='1&month=1&day=1"

# Test 3: Body'da SQL injection (Products POST - authentication kerak, lekin pattern tekshiriladi)
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"name":"test'\'' OR '\''1'\''='\''1","code":"TEST"}'

# Test 4: UNION SELECT
curl "http://localhost:3000/hira/search?yadmNm=test' UNION SELECT * FROM users--"

# Keyin metrics'ni tekshiring
curl http://localhost:3000/metrics | grep "sql_injection"
```

**Kutilgan natija**: 
```
cyber_attacks_total{attack_type="sql_injection",severity="high",...} 1
```

### 3. XSS Attack Test

**Sabab**: XSS body yoki URL'da script pattern bo'lishi kerak.

```bash
# Test 1: Body'da XSS (Products POST - authentication kerak, lekin pattern tekshiriladi)
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"name":"<script>alert(1)</script>","code":"TEST"}'

# Test 2: URL'da XSS (Calendar endpoint)
curl "http://localhost:3000/api/calendar/lunar-to-solar?year=2024&month=<script>alert('XSS')</script>&day=1"

# Test 3: iframe XSS (Support inquiry - authentication kerak)
curl -X POST http://localhost:3000/support/inquiry \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"inquiry":"<iframe src=\"javascript:alert(1)\"></iframe>"}'

# Test 4: Event handler XSS (HIRA search)
curl "http://localhost:3000/hira/search?yadmNm=test\" onclick=\"alert(1)\""

# Keyin metrics'ni tekshiring
curl http://localhost:3000/metrics | grep "xss"
```

**Kutilgan natija**: 
```
cyber_attacks_total{attack_type="xss",severity="high",...} 1
```

### 4. Path Traversal Test

**Sabab**: Path traversal URL'da `../` pattern bo'lishi kerak.

```bash
# Test 1: Basic path traversal
curl "http://localhost:3000/api/files/../../../etc/passwd"

# Test 2: Encoded path traversal
curl "http://localhost:3000/api/files/..%2F..%2F..%2Fetc%2Fpasswd"

# Test 3: Double path traversal
curl "http://localhost:3000/api/files/../../../../etc/passwd"

# Keyin metrics'ni tekshiring
curl http://localhost:3000/metrics | grep "path_traversal"
```

**Kutilgan natija**: 
```
cyber_attacks_total{attack_type="path_traversal",severity="medium",...} 1
```

### 5. DDoS Attack Test

**Sabab**: DDoS 100+ request yoki 50+ req/s bo'lishi kerak.

```bash
# Test: 150 ta request parallel
for i in {1..150}; do
  curl http://localhost:3000/api/products &
done
wait

# Keyin metrics'ni tekshiring
curl http://localhost:3000/metrics | grep "ddos"
```

**Kutilgan natija**: 
```
cyber_attacks_total{attack_type="ddos",severity="critical",...} 1
```

### 6. Suspicious User-Agent Test

**Sabab**: Bot/scanner user-agent bo'lishi kerak.

```bash
# Test 1: sqlmap user-agent
curl -H "User-Agent: sqlmap/1.0" http://localhost:3000/api/products

# Test 2: nmap user-agent
curl -H "User-Agent: nmap" http://localhost:3000/api/products

# Test 3: Empty user-agent
curl -H "User-Agent: " http://localhost:3000/api/products

# Keyin metrics'ni tekshiring
curl http://localhost:3000/metrics | grep "suspicious_user_agent"
```

**Kutilgan natija**: 
```
cyber_attacks_total{attack_type="suspicious_user_agent",severity="medium",...} 1
```

## 🔍 Barcha Attack'larini Birga Tekshirish

```bash
# Barcha test'larni bir vaqtda ishga tushirish
echo "=== Testing All Attacks ==="

echo "1. Brute Force..."
for i in {1..6}; do
  curl -s -X POST http://localhost:3000/iam/members/login \
    -H "Content-Type: application/json" \
    -d '{"memberId":"test","password":"wrong"}' > /dev/null
  sleep 0.5
done

echo "2. SQL Injection..."
curl -s "http://localhost:3000/api/products?search=' OR '1'='1" > /dev/null

echo "3. XSS..."
curl -s -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"name":"<script>alert(1)</script>"}' > /dev/null

echo "4. Path Traversal..."
curl -s "http://localhost:3000/api/files/../../../etc/passwd" > /dev/null

echo "5. Suspicious User-Agent..."
curl -s -H "User-Agent: sqlmap/1.0" http://localhost:3000/api/products > /dev/null

echo ""
echo "=== Results ==="
curl -s http://localhost:3000/metrics | grep "cyber_attacks_total" | grep -v "#"
```

## 📊 Prometheus'da Tekshirish

```bash
# Barcha attack type'lar
curl -s "http://localhost:9090/api/v1/query?query=sum%20by%20(attack_type)%20(cyber_attacks_total)" | jq

# Brute force
curl -s "http://localhost:9090/api/v1/query?query=cyber_attacks_total{attack_type=\"brute_force\"}" | jq

# SQL injection
curl -s "http://localhost:9090/api/v1/query?query=cyber_attacks_total{attack_type=\"sql_injection\"}" | jq

# XSS
curl -s "http://localhost:9090/api/v1/query?query=cyber_attacks_total{attack_type=\"xss\"}" | jq
```

## 🐛 Troubleshooting

### Attack aniqlanmayapti

1. **Backend log'larni tekshiring**:
   ```bash
   docker logs backend | grep "CYBER ATTACK"
   ```

2. **Metrics endpoint'ni tekshiring**:
   ```bash
   curl http://localhost:3000/metrics | grep cyber_attack
   ```

3. **Pattern to'g'ri ekanligini tekshiring**:
   - SQL injection: `' OR '1'='1` yoki `UNION SELECT`
   - XSS: `<script>` yoki `javascript:`
   - Path traversal: `../` yoki `..%2F`

### Brute force ishlamayapti

- 5 ta failed login kerak (default threshold)
- Login endpoint bo'lishi kerak: `/iam/members/login`
- 401 yoki 403 status code bo'lishi kerak

### SQL/XSS ishlamayapti

- URL query string tekshiriladi (hozirgi versiyada)
- Body tekshiriladi
- Pattern to'g'ri bo'lishi kerak

## ✅ Kutilgan Natijalar

Test qilgandan keyin quyidagi metrics'lar ko'rinishi kerak:

```
cyber_attacks_total{attack_type="brute_force",...} >= 1
cyber_attacks_total{attack_type="sql_injection",...} >= 1
cyber_attacks_total{attack_type="xss",...} >= 1
cyber_attacks_total{attack_type="path_traversal",...} >= 1
cyber_attacks_total{attack_type="suspicious_user_agent",...} >= 1
```

---

**✅ Test qiling va natijani tekshiring!**

