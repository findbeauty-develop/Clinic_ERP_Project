# Telegram Monitoring Setup Guide

## 📋 Qadam 1: Telegram Bot Yaratish

### 1.1 BotFather'dan Bot Yaratish

1. **Telegram'da BotFather'ni toping:**
   - Telegram'da `@BotFather` ni qidiring
   - Yoki to'g'ridan-to'g'ri: https://t.me/botfather

2. **Bot yaratish:**
   ```
   /start
   /newbot
   ```

3. **Bot nomi va username berish:**
   - Bot nomi: `Clinic ERP Monitoring Bot` (yoki xohlagan nom)
   - Bot username: `clinic_erp_monitoring_bot` (oxiri `_bot` bilan tugashi kerak)

4. **Bot Token olish:**
   - BotFather sizga token beradi, masalan:
   ```
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
   - Bu tokenni saqlab qo'ying!

### 1.2 Chat ID Olish

#### O'zingizga xabar yuborish uchun (Personal Chat):

1. **Userinfobot orqali:**
   - `@userinfobot` ga yozing
   - Sizga Chat ID beradi, masalan: `123456789`

2. **Yoki manual:**
   - O'zingizga bot yuborilgan xabarni forward qiling
   - `@getidsbot` ga forward qiling
   - Chat ID ko'rsatiladi

#### Gruhga xabar yuborish uchun (Group Chat):

1. **Gruhga bot qo'shing:**
   - Gruhga `@clinic_erp_monitoring_bot` ni qo'shing
   - Admin qiling (ixtiyoriy)

2. **Chat ID olish:**
   - Gruhga `@getidsbot` ni qo'shing
   - Gruhda `/start` yozing
   - Chat ID ko'rsatiladi, masalan: `-1001234567890` (minus bilan boshlanadi)

### 1.3 Test Qilish

Bot'ni test qilish uchun:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "<YOUR_CHAT_ID>",
    "text": "Test message from Clinic ERP"
  }'
```

Agar xabar kelsa, bot to'g'ri ishlayapti! ✅

---

## 📋 Qadam 2: Environment Variables Qo'shish

### 2.1 Production Environment (.env.production)

```bash
# Telegram Bot Configuration (REQUIRED for production monitoring)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789

# Optional: External API Monitoring
PAYMENT_API_URL=https://payment-api.example.com
PAYMENT_API_KEY=your_payment_api_key
```

**⚠️ Muhim:** 
- `TELEGRAM_BOT_TOKEN` va `TELEGRAM_CHAT_ID` production'da majburiy
- Agar ular bo'lmasa, monitoring service ishlamaydi (lekin error yubormaydi)
- Faqat production mode'da (`NODE_ENV=production`) Telegram notification'lar ishlaydi

### 2.2 Development Environment (.env.local)

Development'da Telegram notification'lar ishlamaydi (faqat log qilinadi), lekin test qilish uchun qo'shishingiz mumkin:

```bash
# Telegram Bot Configuration (Optional for testing)
TELEGRAM_BOT_TOKEN=your_test_bot_token
TELEGRAM_CHAT_ID=your_test_chat_id
```

**Note:** Development'da ham test qilish uchun qo'yishingiz mumkin, lekin notification'lar yuborilmaydi (faqat log qilinadi).

---

## 📋 Qadam 3: Projectga Implement Qilish

### 3.1 Service'lar Yaratish

1. **TelegramNotificationService** - Telegram API bilan ishlash
2. **MonitoringService** - Health check va monitoring
3. **Exception Filter'ga integration** - Error'lar uchun alert

### 3.2 Monitoring Qiladigan Narsalar

- ✅ Database connection failures
- ✅ Critical errors (500+)
- ✅ External API failures (payment, etc.)
- ✅ Slow queries (>1 second)
- ✅ Health check failures

### 3.3 Notification Format

```
🚨 Production Error Alert

⏰ Time: 2024-01-15T10:30:00Z
❌ Error: Database connection failed
🔗 URL: POST /api/orders
👤 User ID: user_123
🏢 Tenant ID: clinic_456

📋 Stack:
<code>Error: Connection timeout...</code>
```

---

## 📋 Qadam 4: Testing

### 4.1 Local Test

```bash
# Development mode'da test qilish
cd apps/backend
npm run dev

# Test notification yuborish (browser yoki Postman orqali)
# POST http://localhost:3000/monitoring/test-notification
```

### 4.2 API Endpoints

Monitoring uchun quyidagi endpoint'lar mavjud:

1. **Health Check:**
   ```
   GET /monitoring/health
   ```
   - Database connection status'ni tekshiradi
   - Response: `{ status: "healthy", database: "connected", timestamp: "..." }`

2. **Test Notification:**
   ```
   POST /monitoring/test-notification
   ```
   - Telegram'ga test xabar yuboradi
   - Response: `{ success: true, message: "..." }`

3. **Manual Health Check:**
   ```
   POST /monitoring/health-check
   ```
   - Barcha health check'larni qo'lda ishga tushiradi
   - Response: `{ success: true, message: "Health check completed" }`

### 4.3 Production Test

Production'ga deploy qilgandan keyin:

1. **Test Notification:**
   ```bash
   curl -X POST https://api.jaclit.com/monitoring/test-notification
   ```
   - Telegram'da test xabar kelishi kerak

2. **Database Test:**
   - Database'ni biror vaqt o'chirib qo'ying (test uchun)
   - 3 marta error bo'lgandan keyin Telegram'da alert kelishi kerak
   - Database'ni qayta yoqing
   - Keyingi health check'da recovery bo'ladi

3. **Error Test:**
   - Biror endpoint'ga noto'g'ri request yuboring (500 error)
   - Telegram'da error alert kelishi kerak

---

## 📋 Qadam 5: Best Practices

### 5.1 Rate Limiting

- Har bir error uchun emas, faqat critical error'lar uchun
- Database error'lar uchun max 3 marta (spam oldini olish)
- Health check har 5 minutda

### 5.2 Error Filtering

- 404 error'lar uchun notification yuborilmaydi
- Static file error'lar uchun notification yuborilmaydi
- Favicon error'lar uchun notification yuborilmaydi

### 5.3 Security

- Bot token'ni hech qachon commit qilmang
- `.env.production` faylni `.gitignore` ga qo'shing
- Production'da faqat production bot token ishlatish

---

## 📋 Qadam 6: Monitoring Dashboard (Optional)

Kelajakda monitoring dashboard yaratish mumkin:

- Error statistics
- Database connection history
- External API status
- Response time metrics

---

## 🚀 Quick Start

1. **Bot yarating** - BotFather orqali
2. **Chat ID oling** - @userinfobot yoki @getidsbot orqali
3. **Environment variables qo'shing** - .env.production faylga
4. **Code deploy qiling** - Production'ga
5. **Test qiling** - Error yuborish orqali

---

## 📞 Support

Agar muammo bo'lsa:
- Bot token to'g'ri ekanligini tekshiring
- Chat ID to'g'ri ekanligini tekshiring
- Network connection'ni tekshiring
- Log'larni ko'rib chiqing

---

## ✅ Checklist

- [ ] Bot yaratildi va token olingan
- [ ] Chat ID olingan
- [ ] Environment variables qo'shildi
- [ ] Code implement qilindi
- [ ] Local test qilindi
- [ ] Production'ga deploy qilindi
- [ ] Production test qilindi
- [ ] Notification'lar kelayotganini tasdiqlash

