# 📧 Mailgun Email Provider Setup Guide

Bu qo'llanma Mailgun'ni projectingizga sozlash bo'yicha step-by-step instruktsiya.

---

## 🎯 1-QADAM: Mailgun Account Yaratish

1. **Mailgun saytiga boring**: [https://app.mailgun.com/](https://app.mailgun.com/)
2. **Sign Up** tugmasini bosing
3. **Email va passwordingizni kiriting**
4. **Email tasdiqlang** (Mailgun sizga verification email yuboradi)
5. **Account yaratilgandan keyin, dashboard'ga o'ting**

---

## 🔑 2-QADAM: API Key Olish

1. **Mailgun Dashboard**'da **Settings** → **API Keys** ga o'ting
2. **Private API Key**'ni copy qiling (masalan: `key-1234567890abcdef...`)
   - ⚠️ Bu key'ni **xavfsiz** joyda saqlang!
   - 🔒 **Git**'ga commit qilmang!

**Eslatma:**

- Private API key sizning account'ingizga to'liq access beradi
- Agar key leak bo'lsa, uni darhol o'zgartiring!

---

## 🌐 3-QADAM: Domain Qo'shish va Verify Qilish

### Option 1: Mailgun Sandbox Domain (Test uchun)

Mailgun har bir yangi account'ga **sandbox domain** beradi (masalan: `sandboxXXXXXXXX.mailgun.org`).

**Sandbox domain'ning cheklovi:**

- ✅ **Bepul**: 100 email/month
- ❌ **Faqat verified email'larga**: Siz dashboard'da qo'shgan email'larga
- ❌ **Production uchun emas**: Test uchun ideal

**Sandbox domain'dan foydalanish:**

1. Dashboard'da **Sending** → **Domains** ga o'ting
2. Sandbox domain'ni ko'ring (masalan: `sandboxXXXXXXXX.mailgun.org`)
3. Bu domain'ni `.env` file'da ishlatishingiz mumkin

**Verified email qo'shish (Sandbox uchun):**

1. Dashboard'da **Sending** → **Authorized Recipients** ga o'ting
2. **Add Recipient** tugmasini bosing
3. Email addressni kiriting (masalan: `test@example.com`)
4. Mailgun verification email yuboradi
5. Email'ni verify qiling

### Option 2: O'z Domain'ingizni Ulash (Production uchun)

Agar o'zingizning domain'ingiz bo'lsa (masalan: `example.com`):

1. **Dashboard'da Sending → Domains → Add New Domain**
2. **Domain nomini kiriting** (masalan: `mg.example.com` yoki `example.com`)
3. **DNS records qo'shing** (Mailgun sizga kerakli DNS record'larni ko'rsatadi):

   **Kerakli DNS Records:**

   ```
   TXT  _domainkey.mg.example.com  → k=rsa; p=MIIB...
   TXT  mg.example.com             → v=spf1 include:mailgun.org ~all
   CNAME email.mg.example.com      → mailgun.org
   CNAME mta._domainkey.mg.example.com → mta.mailgun.org
   ```

4. **DNS provider'ingizga o'ting** (masalan: Cloudflare, Namecheap, GoDaddy)
5. **Bu record'larni qo'shing**
6. **Mailgun'da Verify Domain** tugmasini bosing
7. **Verification kutish** (DNS propagation 5-10 minut olishi mumkin)

**Eslatma:**

- ✅ Production uchun subdomain ishlatish tavsiya etiladi: `mg.example.com`
- ✅ Bu sizning asosiy domain'ingizning reputation'ini himoya qiladi
- ⚠️ DNS record'larni to'g'ri qo'shing, aks holda email'lar yuborilmaydi!

---

## ⚙️ 4-QADAM: Backend Configuration

### `.env` File'ni Yangilash

Backend `apps/backend/.env` file'ingizni oching va quyidagi qatorlarni qo'shing/yangilang:

```bash
# ======================================
# EMAIL CONFIGURATION
# ======================================

# Email provider: "mailgun" yoki "amazon-ses"
EMAIL_PROVIDER=mailgun

# ======================================
# MAILGUN CONFIGURATION
# ======================================

# Mailgun API Key (Settings → API Keys dan oling)
MAILGUN_API_KEY=key-1234567890abcdef...

# Mailgun Domain (Sending → Domains dan oling)
# Test uchun: sandboxXXXXXXXX.mailgun.org
# Production uchun: mg.example.com
MAILGUN_DOMAIN=sandboxXXXXXXXX.mailgun.org

# From email address (email yuboruvchi manzil)
# Format: "Name <email@domain>"
MAILGUN_FROM_EMAIL=Clinic ERP <noreply@sandboxXXXXXXXX.mailgun.org>
```

**Eslatma:**

- 🔒 `.env` file'ni **Git**'ga commit qilmang!
- ✅ `.gitignore` da `.env` mavjudligini tekshiring
- ⚠️ `MAILGUN_DOMAIN` Mailgun dashboard'dagi domain bilan bir xil bo'lishi kerak
- ⚠️ `MAILGUN_FROM_EMAIL` da domain `MAILGUN_DOMAIN` bilan mos kelishi kerak

### AWS SES'dan Mailgun'ga O'tish

Agar AWS SES ishlatayotgan bo'lsangiz va Mailgun'ga o'tmoqchi bo'lsangiz:

```bash
# Eski AWS SES config (comment out yoki o'chiring):
# EMAIL_PROVIDER=amazon-ses
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# AWS_REGION=us-east-1
# AWS_SES_FROM_EMAIL=...

# Yangi Mailgun config:
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=key-1234567890abcdef...
MAILGUN_DOMAIN=sandboxXXXXXXXX.mailgun.org
MAILGUN_FROM_EMAIL=Clinic ERP <noreply@sandboxXXXXXXXX.mailgun.org>
```

---

## 🧪 5-QADAM: Test Qilish

### Backend'ni Restart Qiling

```bash
cd apps/backend
npm run dev
```

**Console log'da ko'rishingiz kerak:**

```
[EmailService] Email provider initialized: mailgun
[MailgunProvider] Mailgun provider initialized
```

### Test Email Yuborish

Project'da order yoki return notification yuborishga harakat qiling.

**Yoki manual test:**

1. Order yaratish
2. Supplier'ga notification yuborilishi kerak
3. Mailgun dashboard'da **Logs** → **Sending** ga o'ting
4. Email yuborilganini ko'rasiz

**Agar sandbox domain ishlatayotgan bo'lsangiz:**

- Faqat Authorized Recipients'ga email yuboriladi
- Dashboard'da recipient qo'shishni unutmang!

---

## 🔍 6-QADAM: Troubleshooting

### Email yuborilmayapti?

**1. Console log'ni tekshiring:**

```bash
[MailgunProvider] Mailgun email failed: ...
```

**2. API Key to'g'rimi?**

- Mailgun dashboard → Settings → API Keys
- Private API Key copy qiling va `.env` ga qo'shing

**3. Domain verify qilganmisiz?**

- Mailgun dashboard → Sending → Domains
- Status: **Verified** bo'lishi kerak
- Agar **Unverified** bo'lsa, DNS record'larni tekshiring

**4. Sandbox domain'dan foydalanayapsizmi?**

- Mailgun dashboard → Sending → Authorized Recipients
- Recipient email qo'shing va verify qiling

**5. From email to'g'rimi?**

- `.env` da `MAILGUN_FROM_EMAIL` domain bilan mos kelishi kerak
- ✅ To'g'ri: `noreply@sandboxXXXXXXXX.mailgun.org`
- ❌ Noto'g'ri: `noreply@gmail.com` (domain bilan mos kelmaydi)

### DNS Verification Failed?

**1. DNS record'larni tekshiring:**

- Mailgun'da ko'rsatilgan record'lar bilan solishtiring
- DNS provider'da to'g'ri qo'shilganligini tekshiring

**2. DNS propagation kutish:**

- 5-10 minut kutib, qayta verify qiling
- Online DNS checker ishlatib tekshiring: [https://dnschecker.org/](https://dnschecker.org/)

**3. Record type to'g'rimi?**

- TXT record → TXT
- CNAME record → CNAME
- MX record → MX (agar kerak bo'lsa)

---

## 💰 7-QADAM: Pricing va Limits

### Mailgun Free Plan (Sandbox):

- ✅ **100 email/month** (bepul)
- ❌ Faqat authorized recipients'ga
- ❌ Production uchun emas

### Mailgun Paid Plans:

- **Foundation**: $35/month (50,000 email)
- **Growth**: $80/month (100,000 email)
- **Scale**: Custom pricing

**Eslatma:**

- Production'da ishlatish uchun paid plan kerak
- Domain verify qilganingizdan keyin paid plan'ga o'ting
- Pricing: [https://www.mailgun.com/pricing/](https://www.mailgun.com/pricing/)

---

## 🔐 8-QADAM: Security Best Practices

1. ✅ **API Key'ni xavfsiz saqlang**

   - Git'ga commit qilmang
   - Environment variable ishlatiladi
   - Production'da secret manager ishlatish tavsiya etiladi

2. ✅ **Domain reputation'ni himoya qiling**

   - Subdomain ishlatish (masalan: `mg.example.com`)
   - SPF, DKIM, DMARC record'larni qo'shish
   - Bounce va complaint rate'ni monitor qilish

3. ✅ **Rate limiting**

   - Mailgun API rate limit: 100 request/second
   - Backend'da retry mechanism bor

4. ✅ **Email validation**
   - Invalid email'larga yuborilmaydi
   - Backend validation logic bor

---

## 📊 9-QADAM: Monitoring

### Mailgun Dashboard'da:

1. **Sending** → **Logs**: Barcha yuborilgan email'lar
2. **Analytics**: Email statistics
3. **Suppressions**: Bounce va complaint'lar

### Backend Log'da:

```bash
[MailgunProvider] Mailgun email sent to test@example.com (MessageId: ...)
```

---

## 🎉 Tayyor!

Endi Mailgun sizning project'ingizda ishlayapti! 🚀

**Agar yordam kerak bo'lsa:**

- 📧 Mailgun Support: [https://help.mailgun.com/](https://help.mailgun.com/)
- 📚 Mailgun Docs: [https://documentation.mailgun.com/](https://documentation.mailgun.com/)

---

## 🔄 Orqaga AWS SES'ga O'tish

Agar Mailgun ishlamasa va AWS SES'ga qaytmoqchi bo'lsangiz:

`.env` file'da:

```bash
EMAIL_PROVIDER=amazon-ses
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_SES_FROM_EMAIL=...
```

Backend'ni restart qiling va AWS SES ishlay boshlaydi.

---

**✅ Setup Complete!**
