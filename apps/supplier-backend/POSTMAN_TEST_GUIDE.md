# Postman'da OCR API Test Qilish

## 1. Certificate Upload Endpoint (OCR bilan)

### Endpoint:
```
POST http://localhost:3002/supplier/manager/upload-certificate
```

### Postman Setup:

#### Step 1: Request Method va URL
- **Method**: `POST`
- **URL**: `http://localhost:3002/supplier/manager/upload-certificate`

#### Step 2: Body Configuration
1. **Body** tab'ni oching
2. **form-data** ni tanlang (x-www-form-urlencoded emas!)
3. Key'ni `file` deb nomlang
4. Key'ning yonidagi dropdown'dan **File** ni tanlang (Text emas!)
5. **Select Files** tugmasini bosing va 사업자등록증 image'ni tanlang

#### Step 3: Headers
Headers'ga qo'lda biror narsa qo'shish shart emas. Postman avtomatik `Content-Type: multipart/form-data` qo'shadi.

### Expected Response:

**Success Response (OCR muvaffaqiyatli):**
```json
{
  "message": "파일 업로드 및 OCR 처리가 완료되었습니다",
  "fileUrl": "/uploads/supplier/certificate/cert_1234567890_abc123.jpg",
  "filename": "cert_1234567890_abc123.jpg",
  "size": 245678,
  "ocrResult": {
    "rawText": "법인명 예시회사\n등록번호 123-45-67890\n사업장 소재지 서울시 강남구...",
    "parsedFields": {
      "companyName": "예시회사",
      "businessNumber": "123-45-67890",
      "address": "서울시 강남구 테헤란로 123",
      "representativeName": "홍길동",
      "businessType": "도매 및 소매업",
      "businessItem": "의료기기",
      "rawText": "..."
    }
  }
}
```

**Success Response (OCR muvaffaqiyatsiz, lekin file upload bo'ldi):**
```json
{
  "message": "파일 업로드가 완료되었습니다",
  "fileUrl": "/uploads/supplier/certificate/cert_1234567890_abc123.jpg",
  "filename": "cert_1234567890_abc123.jpg",
  "size": 245678,
  "ocrResult": null
}
```

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "파일을 업로드하세요"
}
```

## 2. Boshqa Endpoint'lar

### Check Phone Number
```
POST http://localhost:3002/supplier/manager/check-phone
Content-Type: application/json

{
  "phoneNumber": "01012345678"
}
```

### Register Manager
```
POST http://localhost:3002/supplier/manager/register
Content-Type: application/json

{
  "name": "홍길동",
  "phoneNumber": "01012345678",
  "certificateImageUrl": "/uploads/supplier/certificate/cert_1234567890_abc123.jpg"
}
```

### Register Company
```
POST http://localhost:3002/supplier/manager/register-company
Content-Type: application/json

{
  "companyName": "예시회사",
  "businessNumber": "123-45-67890",
  "companyPhone": "02-1234-5678",
  "companyEmail": "company@example.com",
  "companyAddress": "서울시 강남구...",
  "productCategories": ["cosmeceutical", "injection"],
  "shareConsent": true
}
```

## 3. Postman Collection Import

Agar xohlasangiz, quyidagi JSON'ni Postman'ga import qilishingiz mumkin:

```json
{
  "info": {
    "name": "Supplier Backend API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Upload Certificate (OCR)",
      "request": {
        "method": "POST",
        "header": [],
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "file",
              "type": "file",
              "src": []
            }
          ]
        },
        "url": {
          "raw": "http://localhost:3002/supplier/manager/upload-certificate",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3002",
          "path": ["supplier", "manager", "upload-certificate"]
        }
      }
    }
  ]
}
```

## 4. Test Qilish

1. Backend server ishlamoqda ekanligini tekshiring: `http://localhost:3002`
2. Postman'da yuxoridagi endpoint'ni sozlang
3. 사업자등록증 image'ni tanlang
4. **Send** tugmasini bosing
5. Response'da `ocrResult` bo'lishi kerak

## 5. Troubleshooting

### Error: "파일을 업로드하세요"
- **Sabab**: File tanlanmagan yoki `file` key nomi noto'g'ri
- **Tuzatish**: Key nomini `file` qiling va type'ni **File** qiling

### Error: "지원하지 않는 파일 형식입니다"
- **Sabab**: File formati qo'llab-quvvatlanmaydi
- **Tuzatish**: Faqat JPG, PNG, WEBP formatlarini ishlating

### Error: "파일 크기는 10MB 이하여야 합니다"
- **Sabab**: File juda katta
- **Tuzatish**: File'ni 10MB dan kichik qiling

### OCR Result null
- **Sabab**: OCR authentication xatosi yoki image'da text yo'q
- **Tuzatish**: 
  - Google Cloud Vision setup'ni tekshiring
  - Image'da aniq text borligini tekshiring
  - Backend loglarini ko'rib chiqing

