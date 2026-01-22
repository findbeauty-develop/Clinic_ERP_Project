# 🔒 Production Security Checklist & TODO List

✅ Agar eng kuchli 5ta “must do” desam:

✅ Portlarni yopish (80/443 only)

✅ SSL (HTTPS)

✅ RLS policies

✅ Rate limit (login/upload)

✅ token localStorage → httpOnly cookie

## 📋 Umumiy Holat

Bu dokument mavjud security features va qilish kerak bo'lgan security ishlarni o'z ichiga oladi.

---

## ✅ TAYYOR QILINGAN XAVFSIZLIKLAR (Mavjud)

### 1. Authentication & Authorization
- ✅ **JWT Authentication** - `JwtTenantGuard` implement qilingan
- ✅ **Multi-tenant Support** - Tenant ID guard orqali tekshiriladi
- ✅ **Role-based Access Control** - `RolesGuard` mavjud
- ✅ **API Key Guard** - Service-to-service communication uchun
- ✅ **Token Validation** - Supabase va local JWT fallback
- ✅ **X-Tenant-ID Header** - Fallback tenant identification

### 2. CORS Configuration
- ✅ **Environment-based CORS** - `CORS_ORIGINS` environment variable
- ✅ **Credentials Support** - `credentials: true` sozlangan
- ✅ **Allowed Methods** - GET, POST, PUT, DELETE, PATCH, OPTIONS
- ✅ **Allowed Headers** - Content-Type, Authorization, X-API-Key

### 3. Input Validation
- ✅ **ValidationPipe** - Global validation pipe sozlangan
- ✅ **DTO Validation** - Class-validator decorators ishlatiladi
- ✅ **Type Transformation** - Transform: true enabled
- ✅ **Whitelist** - Field filtering (hozircha false, lekin individual decorators bilan)

### 4. Database Security
- ✅ **Prisma ORM** - SQL injection protection (parametrized queries)
- ✅ **Multi-tenant Filtering** - Barcha query'larda tenant_id filter
- ✅ **Transaction Support** - ACID transactions

### 5. File Upload Security
- ✅ **Multer Integration** - File upload middleware
- ✅ **File Size Limit** - 10MB limit sozlangan
- ✅ **Body Parser Limits** - JSON va URL-encoded limits

### 6. Compression & Performance
- ✅ **Gzip Compression** - Response compression enabled
- ✅ **Performance Logger** - Request/response logging middleware

### 7. API Documentation
- ✅ **Swagger/OpenAPI** - API documentation endpoint
- ✅ **Bearer Auth** - Swagger'da authentication support

---

#### 1. Token Storage Security
**Muammo:** Token localStorage'da saqlanadi - XSS hujumida o'g'irlanadi


- ✅  HttpOnly Cookie'ga o'tkazish
- ✅  Refresh Token pattern implement qilish
- ✅  Access token'ni memory'da saqlash (localStorage emas)
- ✅  Refresh token endpoint yaratish (`/member/refresh`)
- ✅ Logout endpoint'da token invalid qilish
- ✅  Database'da refresh token blacklist


### 3. Rate Limiting
**Muammo:** Rate limiting yo'q - DDoS va brute force hujumlariga ochiq

**Qilish kerak:**
- ✅ `@nestjs/throttler` package o'rnatish
- ✅ Global throttler guard qo'shish
- ✅ Login endpoint'da qattiq limit (5 req/min)
- ✅ Refresh endpoint'da limit (20 req/min)
- [ ] Nginx'da IP-based rate limiting (Production'da qilish kerak)
- [ ] Fail2ban sozlash (Production'da qilish kerak)

**Fayllar:**
- ✅ `apps/backend/src/app.module.ts`
- ✅ `apps/backend/src/modules/member/controllers/members.controller.ts`
- [ ] Nginx config file (Production'da qilish kerak)

---

#### 6. Error Handling & Logging
**Muammo:** Production'da stack trace ko'rinadi

**Qilish kerak:**
- ✅  HTTP Exception Filter yaratish
- ✅ Production'da stack trace yashirish
- ✅  Error logging (Winston yoki Pino)
- ✅ Sensitive data filtering



#### 7. Swagger Security
**Muammo:** Production'da Swagger ochiq

**Qilish kerak:**
- ✅ Production'da Swagger butunlay o'chirish (development'da ishlaydi)
- [ ] Nginx'da `/docs` endpoint'ni IP whitelist qilish (ixtiyoriy)
- [ ] Yoki basic auth qo'shish (ixtiyoriy)

**Fayllar:**
- ✅ `apps/backend/src/main.ts` (conditional Swagger)
- [ ] Nginx config file (ixtiyoriy)


**Fayllar:**
- `apps/backend/src/common/filters/http-exception.filter.ts` (yangi)

---

## ❌ QILISH KERAK BO'LGAN ISHLAR (TODO)

### 🔴 CRITICAL (Production'ga chiqishdan oldin majburiy)

#### 1. Token Storage Security
**Muammo:** Token localStorage'da saqlanadi - XSS hujumida o'g'irlanadi

**Qilish kerak:**
- [ ] HttpOnly Cookie'ga o'tkazish
- [ ] Refresh Token pattern implement qilish
- [ ] Access token'ni memory'da saqlash (localStorage emas)
- [ ] Refresh token endpoint yaratish (`/member/refresh`)
- [ ] Logout endpoint'da token invalid qilish
- [ ] Database'da refresh token blacklist

**Fayllar:**
- `apps/backend/src/modules/member/services/members.service.ts`
- `apps/backend/src/modules/member/controllers/members.controller.ts`
- `apps/frontend/lib/api.ts`
- `apps/frontend/app/login/login-client.tsx`

---

#### 2. CORS Production Safety
**Muammo:** Production'da localhost fallback mavjud

**Qilish kerak:**
- ✅ Production'da localhost fallback'ni o'chirish
- ✅ CORS_ORIGINS bo'sh bo'lsa error throw qilish
- ✅ Origin validation callback function
- ✅ Preflight request handling

**Fayllar:**
- ✅ `apps/backend/src/main.ts` (Line 23-65)
- ✅ `apps/supplier-backend/src/main.ts` (Line 28-70)

---

#

#### 4. XSS Protection
**Muammo:** Input sanitization yo'q

**Qilish kerak:**
- [ ] DOMPurify package o'rnatish (`isomorphic-dompurify`)
- [ ] Input sanitization utility yaratish
- [ ] HTML content sanitization
- [ ] CSP header qo'shish (Nginx)
- [ ] X-XSS-Protection header

**Fayllar:**
- `apps/frontend/lib/sanitize.ts` (yangi fayl)
- Nginx config file

---

#### 5. CSRF Protection
**Muammo:** CSRF protection yo'q

**Qilish kerak:**
- [ ] CSRF middleware yaratish
- [ ] CSRF token generation endpoint
- [ ] Frontend'da CSRF token olish va yuborish
- [ ] Session management (cookie-session yoki express-session)

**Fayllar:**
- `apps/backend/src/common/middleware/csrf.middleware.ts` (yangi)
- `apps/frontend/lib/api.ts`

---



---

### 🟡 IMPORTANT (Production'da tavsiya etiladi)

#### 8. Server Security (EC2/Firewall)
**Qilish kerak:**
- [ ] UFW yoki Security Group sozlash
- [ ] Faqat 80, 443, 22 portlar ochiq
- [ ] 3000-3003 portlar yopiq (Nginx orqali)
- [ ] SSH faqat trusted IP'dan

**Commands:**
```bash
sudo ufw enable
sudo ufw allow from YOUR_TRUSTED_IP to any port 22
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw default deny incoming
```

---

#### 9. Nginx Reverse Proxy & SSL
**Qilish kerak:**
- [ ] Nginx reverse proxy sozlash
- [ ] SSL sertifikat o'rnatish (Let's Encrypt)
- [ ] HTTP -> HTTPS redirect
- [ ] Security headers (HSTS, X-Frame-Options, CSP)
- [ ] Rate limiting zones
- [ ] Upstream server configuration

**Fayllar:**
- `/etc/nginx/sites-available/clinic-erp` (yangi)

---

#### 10. Supabase RLS (Row Level Security)
**Qilish kerak:**
- [ ] RLS yoqilganligini tekshirish
- [ ] Tenant-based policy'lar yaratish
- [ ] Service role policy'lar
- [ ] RLS test qilish

**SQL Commands:**
```sql
-- RLS yoqilganligini tekshirish
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- RLS yoqish
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Policy yaratish
CREATE POLICY "Users can only access their tenant's products"
ON products FOR ALL
USING (tenant_id = current_setting('app.tenant_id', true));
```

---

#### 11. Environment Variables Security
**Qilish kerak:**
- [ ] `.gitignore`'da `.env*` fayllar borligini tekshirish
- [ ] `NEXT_PUBLIC_*` faqat public ma'lumotlar
- [ ] Service role key frontend'da yo'qligini tekshirish
- [ ] Docker secrets yoki AWS Secrets Manager

**Tekshirish:**
```bash
# .gitignore tekshirish
grep -r "\.env" .gitignore

# Frontend'da service role key qidirish
grep -r "SERVICE_ROLE" apps/frontend/
```

---

#### 12. File Upload Security
**Qilish kerak:**
- [ ] File type validation (MIME type)
- [ ] File extension validation
- [ ] Filename sanitization
- [ ] Directory traversal protection
- [ ] File size limit (hozir 10MB, lekin validation yo'q)

**Fayllar:**
- `apps/backend/src/common/utils/upload.utils.ts` (yangi yoki yangilash)

---

### 🟢 NICE TO HAVE (Keyinchalik qo'shish mumkin)

#### 13. Monitoring & Logging
- [ ] Nginx access/error logs sozlash
- [ ] Application logging (Winston/Pino)
- [ ] Error tracking (Sentry yoki shunga o'xshash)
- [ ] Health check endpoints
- [ ] Metrics collection

---

#### 14. Advanced Security Features
- [ ] Content Security Policy (CSP) header
- [ ] Subresource Integrity (SRI)
- [ ] Security.txt file
- [ ] HSTS preload
- [ ] Certificate pinning

---

## 📝 Implementation Priority

### Phase 1: Critical (1-hafta)
1. Token Storage Security (HttpOnly Cookie)
2. CORS Production Safety
3. Rate Limiting
4. Error Handling & Logging
5. Swagger Security

### Phase 2: Important (2-hafta)
6. XSS Protection
7. CSRF Protection
8. Server Security (Firewall)
9. Nginx Reverse Proxy & SSL
10. Supabase RLS

### Phase 3: Nice to Have (3-hafta+)
11. Environment Variables Security
12. File Upload Security
13. Monitoring & Logging
14. Advanced Security Features

---

## 🧪 Testing Checklist

Har bir security feature implement qilingandan keyin test qilish kerak:

### Token Security Test
```bash
# Browser console'da
localStorage.getItem('erp_access_token') // null bo'lishi kerak
document.cookie // refresh_token ko'rinishi kerak (HttpOnly)
```

### CORS Test
```bash
curl -X OPTIONS https://api-clinic.your-domain.com/member/login \
  -H "Origin: https://clinic.your-domain.com" \
  -v
```

### Rate Limit Test
```bash
for i in {1..10}; do
  curl -X POST https://api-clinic.your-domain.com/member/login \
    -H "Content-Type: application/json" \
    -d '{"member_id":"test","password":"test"}'
done
# 5-request'dan keyin 429 qaytishi kerak
```

### Port Security Test
```bash
sudo netstat -tulpn | grep LISTEN
# Faqat 80, 443, 22 ko'rinishi kerak
```

### SSL Test
```bash
openssl s_client -connect clinic.your-domain.com:443 \
  -servername clinic.your-domain.com
```

### Security Headers Test
```bash
curl -I https://clinic.your-domain.com
# Quyidagi header'lar bo'lishi kerak:
# Strict-Transport-Security
# X-Frame-Options
# X-Content-Type-Options
# X-XSS-Protection
# Content-Security-Policy
```

---

## 📚 Foydali Resurslar

### Documentation
- [NestJS Security Best Practices](https://docs.nestjs.com/security/authentication)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security](https://nextjs.org/docs/app/building-your-application/configuring/security-headers)
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)

### Tools
- [SSL Labs SSL Test](https://www.ssllabs.com/ssltest/)
- [Security Headers](https://securityheaders.com/)
- [Mozilla Observatory](https://observatory.mozilla.org/)

---

## 🔄 Update History

- **2025-01-XX**: Initial security checklist yaratildi
- **TODO**: Har bir item implement qilinganda yangilash

---

## 📞 Support

Agar security bo'yicha savollar bo'lsa:
1. OWASP Top 10'ni o'rganish
2. NestJS security documentation
3. Code review qilish
