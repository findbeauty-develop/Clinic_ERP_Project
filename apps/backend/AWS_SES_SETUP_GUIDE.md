# AWS SES Setup Guide - Step by Step

Bu guide Amazon SES'ni projectga ulash va sozlash bo'yicha to'liq ko'rsatma.

## 📋 Talablar

- AWS Account
- Domain (sizda bor)
- Domain'ga DNS sozlash huquqi

---

## Step 1: AWS Account yaratish va SES'ga kirish

1. [AWS Console](https://console.aws.amazon.com/) ga kiring
2. Agar account yo'q bo'lsa, yangi account yarating
3. Top bar'dan "Services" ni bosing va "Simple Email Service" ni qidiring
4. SES'ga kiring

---

## Step 2: AWS SES Sandbox Mode'dan chiqish (Production uchun)

**Eslatma:** Sandbox mode'da faqat verify qilingan email address'larga email yuborish mumkin. Production'da domain verify qilish kerak.

### 2.1 Sandbox Mode'ni tekshirish

1. SES Console'da "Account dashboard" ga kiring
2. "Sending statistics" qismida "Sandbox" yozuvi ko'rsatilgan bo'lsa, sandbox mode'da ekansiz

### 2.2 Production Access so'rash

1. SES Console'da left sidebar'dan "Account dashboard" ga kiring
2. "Sending limits" qismida "Request production access" tugmasini bosing
3. Form'ni to'ldiring:
   - **Mail Type:** Transactional (order notifications uchun)
   - **Website URL:** Sizning website URL'ingiz
   - **Use case description:**
     ```
     We are a clinic ERP system that needs to send order notifications
     to suppliers via email. We will send transactional emails only
     when clinics place orders with suppliers.
     ```
   - **Expected sending volume:** Oylik email soni (masalan: 1000-5000)
   - **Expected complaint rate:** < 0.1%
4. "Submit request" tugmasini bosing
5. AWS review qiladi (odatda 24-48 soat)
6. Email orqali javob keladi

---

## Step 3: Domain Verify qilish (Production uchun)

### 3.1 Domain'ni SES'ga qo'shish

1. SES Console'da left sidebar'dan "Verified identities" ga kiring
2. "Create identity" tugmasini bosing
3. "Domain" ni tanlang
4. Domain nomini kiriting (masalan: `yourdomain.com`)
5. "Create identity" tugmasini bosing

### 3.2 DNS Records'ni qo'shish

SES sizga quyidagi DNS records'ni beradi:

#### 3.2.1 SPF Record (TXT)

```
Type: TXT
Name: yourdomain.com (yoki @)
Value: v=spf1 include:amazonses.com ~all
TTL: 3600
```

#### 3.2.2 DKIM Records (CNAME) - 3 ta record

SES 3 ta DKIM record beradi, ularni hammasini qo'shing:

```
Type: CNAME
Name: [random-string-1]._domainkey.yourdomain.com
Value: [random-string-1].dkim.amazonses.com
TTL: 3600

Type: CNAME
Name: [random-string-2]._domainkey.yourdomain.com
Value: [random-string-2].dkim.amazonses.com
TTL: 3600

Type: CNAME
Name: [random-string-3]._domainkey.yourdomain.com
Value: [random-string-3].dkim.amazonses.com
TTL: 3600
```

#### 3.2.3 DMARC Record (TXT) - Ixtiyoriy, lekin tavsiya etiladi

```
Type: TXT
Name: _dmarc.yourdomain.com
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
TTL: 3600
```

### 3.3 DNS Records'ni Domain Provider'da qo'shish

**Masalan: GoDaddy, Namecheap, Cloudflare, va hokazo:**

1. Domain provider'ingizning DNS management page'iga kiring
2. "Add Record" yoki "Add DNS Record" tugmasini bosing
3. Har bir record'ni qo'shing:
   - SPF record (TXT)
   - 3 ta DKIM records (CNAME)
   - DMARC record (TXT) - ixtiyoriy

**Cloudflare misoli:**

1. Cloudflare dashboard'ga kiring
2. Domain'ingizni tanlang
3. "DNS" tab'iga kiring
4. "Add record" tugmasini bosing
5. Har bir record'ni qo'shing

### 3.4 Verification'ni kutish

1. DNS records'ni qo'shgandan keyin, SES Console'ga qaytib kiring
2. "Verified identities" page'da domain'ingizni toping
3. Status "Pending verification" bo'ladi
4. DNS propagation uchun 24-48 soat kutish kerak (odatda 1-2 soat)
5. Status "Verified" ga o'zgarganda, domain verify qilingan

---

## Step 4: Email Address Verify qilish (Sandbox Mode uchun)

Agar hali Production access o'rnatilmagan bo'lsa:

1. SES Console'da "Verified identities" ga kiring
2. "Create identity" tugmasini bosing
3. "Email address" ni tanlang
4. Email address'ni kiriting (masalan: `noreply@yourdomain.com`)
5. "Create identity" tugmasini bosing
6. Email'ingizga verification link keladi
7. Link'ni bosing va verify qiling

**Eslatma:** Sandbox mode'da faqat verify qilingan email address'larga email yuborish mumkin.

---

## Step 5: IAM User yaratish va Access Keys olish

### 5.1 IAM User yaratish

1. AWS Console'da "Services" dan "IAM" ni qidiring
2. IAM Console'ga kiring
3. Left sidebar'dan "Users" ga kiring
4. "Add users" tugmasini bosing
5. User name kiriting (masalan: `ses-email-sender`)
6. "Next" tugmasini bosing

### 5.2 Permissions qo'shish

1. "Attach policies directly" ni tanlang
2. "AmazonSESFullAccess" policy'sini qidiring va tanlang
   - Yoki minimal permission uchun custom policy yarating:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["ses:SendEmail", "ses:SendRawEmail"],
         "Resource": "*"
       }
     ]
   }
   ```
3. "Next" tugmasini bosing
4. "Create user" tugmasini bosing

### 5.3 Access Keys olish

1. Yaratilgan user'ni tanlang
2. "Security credentials" tab'iga kiring
3. "Create access key" tugmasini bosing
4. "Application running outside AWS" ni tanlang
5. "Next" tugmasini bosing
6. Description kiriting (masalan: "SES Email Service")
7. "Create access key" tugmasini bosing
8. **MUHIM:** Access Key ID va Secret Access Key'ni saqlang (keyin ko'rsatilmaydi!)
   - Yoki "Download .csv file" tugmasini bosing

---

## Step 6: AWS Region tanlash

1. SES Console'da top bar'dan region tanlang
2. **Tavsiya:** `us-east-1` (N. Virginia) yoki `ap-northeast-2` (Seoul)
3. **MUHIM:** Barcha SES operatsiyalari (verify, send) bir xil region'da bo'lishi kerak

---

## Step 7: Project'ga sozlash

### 7.1 Package.json'ga AWS SDK qo'shish

```bash
cd apps/backend
npm install aws-sdk
```

### 7.2 Environment Variables qo'shish

`apps/backend/.env` faylga quyidagilarni qo'shing:

```env
# Email Provider
EMAIL_PROVIDER=amazon-ses

# Amazon SES Configuration
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1  # yoki ap-northeast-2 (Seoul)
AWS_SES_FROM_EMAIL=noreply@yourdomain.com  # Verify qilingan email yoki domain'dan email
```

### 7.3 Backend'ni restart qilish

```bash
cd apps/backend
npm run dev
```

---

## Step 8: Test qilish

### 8.1 Test Email yuborish

1. Order yaratish orqali test qiling
2. Supplier'ga email kelishi kerak
3. Log'larni tekshiring:
   ```bash
   # Backend log'larida quyidagilar ko'rinishi kerak:
   # "Amazon SES email sent to supplier@example.com (MessageId: ...)"
   ```

### 8.2 Error'lar bo'lsa

**Common errors:**

1. **"Email address not verified"**

   - Sandbox mode'da bo'lsangiz, recipient email'ni verify qiling
   - Yoki Production access so'rang

2. **"Access Denied"**

   - IAM user'ga to'g'ri permissions berilganligini tekshiring
   - Access keys to'g'ri ekanligini tekshiring

3. **"Invalid email address"**
   - Email format'ini tekshiring
   - Domain verify qilinganligini tekshiring

---

## Step 9: Production'ga tayyorlash

### 9.1 Sending Limits

1. SES Console'da "Account dashboard" ga kiring
2. "Sending limits" qismida:
   - **Sending quota:** Oylik email limiti
   - **Max send rate:** Sekundiga email limiti
3. Agar ko'proq kerak bo'lsa, limit increase so'rang

### 9.2 Bounce va Complaint Monitoring

1. SES Console'da "Configuration" → "Event publishing" ga kiring
2. SNS topic yarating va bounce/complaint event'larini subscribe qiling
3. Bounce rate < 5% bo'lishi kerak
4. Complaint rate < 0.1% bo'lishi kerak

### 9.3 Email Reputation

- Faqat transactional email'lar yuboring (order notifications)
- Spam qilmaslik
- Bounce va complaint'larni monitoring qiling
- Agar reputation past bo'lsa, SES account'ingiz block qilinishi mumkin

---

## 📝 Checklist

- [ ] AWS Account yaratildi
- [ ] SES Console'ga kirildi
- [ ] Production access so'raldi (yoki Sandbox mode'da test qilinmoqda)
- [ ] Domain verify qilindi (Production uchun)
- [ ] Email address verify qilindi (Sandbox uchun)
- [ ] IAM User yaratildi
- [ ] Access Keys olindi va saqlandi
- [ ] DNS Records qo'shildi (SPF, DKIM, DMARC)
- [ ] Environment variables sozlandi
- [ ] Backend restart qilindi
- [ ] Test email yuborildi va muvaffaqiyatli ketdi

---

## 🔗 Foydali Linklar

- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [SES Pricing](https://aws.amazon.com/ses/pricing/)
- [SES Best Practices](https://docs.aws.amazon.com/ses/latest/dg/best-practices.html)
- [DKIM Setup Guide](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim.html)

---

## 💡 Maslahatlar

1. **Sandbox Mode:** Development uchun yaxshi, lekin faqat verify qilingan email'larga yuboradi
2. **Production Access:** Production uchun zarur, lekin review jarayoni bor
3. **Domain Verify:** Production'da domain verify qilish yaxshiroq (har qanday email address'dan yuborish mumkin)
4. **Region:** Barcha operatsiyalar bir xil region'da bo'lishi kerak
5. **Security:** Access keys'ni hech qachon code'ga commit qilmang, faqat .env faylida saqlang

---

## ❓ FAQ

**Q: Domain verify qilish qancha vaqt oladi?**
A: DNS propagation'ga bog'liq, odatda 1-2 soat, ba'zida 24-48 soat.

**Q: Sandbox mode'da qancha email yuborish mumkin?**
A: Kuniga 200 ta email, soniyasiga 1 ta email.

**Q: Production access qancha vaqt oladi?**
A: Odatda 24-48 soat, ba'zida bir necha kun.

**Q: Domain verify qilishdan oldin email yuborish mumkinmi?**
A: Ha, lekin faqat verify qilingan email address'larga (Sandbox mode'da).

**Q: Bir nechta domain verify qilish mumkinmi?**
A: Ha, cheksiz domain verify qilish mumkin.
