# Message Provider Setup Guide

Bu guide SMS va KakaoTalk message yuborish uchun provider'lar sozlash bo'yicha.

## Qo'llab-quvvatlanadigan Provider'lar

1. **CoolSMS** (Korea SMS provider) - Tavsiya etiladi
2. **Twilio** (Global SMS provider)
3. **KakaoTalk Business API** (KakaoTalk messages)

## Environment Variables

`apps/backend/.env` faylga quyidagilarni qo'shing:

```env
# Provider tanlash (twilio, coolsms, kakao)
MESSAGE_PROVIDER=coolsms

# CoolSMS Configuration
COOLSMS_API_KEY=your_api_key
COOLSMS_API_SECRET=your_api_secret
COOLSMS_FROM_NUMBER=01012345678
COOLSMS_KAKAO_TEMPLATE_CODE=your_template_code  # KakaoTalk Alimtalk uchun

# Twilio Configuration (agar ishlatilsa)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890

# KakaoTalk Business API (agar ishlatilsa)
KAKAO_API_KEY=your_kakao_api_key
KAKAO_TEMPLATE_ID=your_template_id

# Frontend URL
FRONTEND_URL=http://localhost:3001
```

## Provider Setup

### 1. CoolSMS (Tavsiya etiladi - Korea uchun)

1. [CoolSMS](https://www.coolsms.co.kr/) saytiga kiring
2. Account yarating
3. API Key va Secret oling
4. SMS service'ni activate qiling
5. KakaoTalk Alimtalk uchun template yarating (ixtiyoriy)

### 2. Twilio

1. [Twilio](https://www.twilio.com/) saytiga kiring
2. Account yarating
3. Account SID va Auth Token oling
4. Phone number oling

### 3. KakaoTalk Business API

1. [Kakao Developers](https://developers.kakao.com/) saytiga kiring
2. App yarating
3. REST API key oling
4. KakaoTalk Business API'ni enable qiling

## Test qilish

Backend'ni ishga tushiring:

```bash
cd apps/backend
npm run dev
```

Postman'da test qiling:

```bash
POST http://localhost:3000/iam/members/send-credentials
Content-Type: application/json

{
  "ownerPhoneNumber": "01012345678",
  "clinicName": "테스트 클리닉",
  "members": [
    {
      "memberId": "manager1@testclinic",
      "role": "manager",
      "temporaryPassword": "TempPass123"
    }
  ]
}
```

## Xavfsizlik

- Temporary password'lar faqat birinchi login'da ishlatiladi
- Birinchi login'da password o'zgartirish majburiy
- Password'lar SMS/KakaoTalk'da yuboriladi, lekin birinchi login'da o'zgartirish talab qilinadi

