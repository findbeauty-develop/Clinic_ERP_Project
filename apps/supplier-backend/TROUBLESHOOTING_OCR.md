# Google Cloud Vision OCR Authentication Error Fix

## Error: `16 UNAUTHENTICATED`

Bu xato Google Cloud Vision API authentication ishlamayotganini ko'rsatadi.

## Tekshirish va tuzatish:

### 1. Service Account Role'ni tekshiring

Google Cloud Console'da:
1. **IAM & Admin** > **Service Accounts** ga o'ting
2. `clinic-ocr-service@clinic-erp-project.iam.gserviceaccount.com` ni toping
3. **Permissions** tab'ni oching
4. Quyidagi role'lardan biri bo'lishi kerak:
   - ✅ **Cloud Vision AI Service Agent** (tavsiya etiladi)
   - ✅ **Cloud Vision API User**
   - ✅ **Editor** (full access, lekin kamroq xavfsiz)

Agar role yo'q bo'lsa:
1. **Grant Access** tugmasini bosing
2. Role qo'shing: `Cloud Vision AI Service Agent`
3. **Save** tugmasini bosing

### 2. Vision API'ni yoqing

1. **APIs & Services** > **Library** ga o'ting
2. "Cloud Vision API" ni qidiring
3. **Enable** tugmasini bosing

### 3. Billing'ni tekshiring

1. **Billing** > **Account management** ga o'ting
2. Billing account active ekanligini tekshiring
3. Agar yo'q bo'lsa, billing account'ni ulang

### 4. Credentials faylini tekshiring

```bash
cd apps/supplier-backend
cat keys/clinic-erp-project-02129d68728d.json | jq '.client_email, .project_id'
```

Quyidagilar ko'rinishi kerak:
- `client_email`: `clinic-ocr-service@clinic-erp-project.iam.gserviceaccount.com`
- `project_id`: `clinic-erp-project`

### 5. Test qiling

```bash
# Node.js orqali test
cd apps/supplier-backend
node -e "
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const fs = require('fs');
const cred = JSON.parse(fs.readFileSync('./keys/clinic-erp-project-02129d68728d.json', 'utf8'));
const client = new ImageAnnotatorClient({
  credentials: {
    client_email: cred.client_email,
    private_key: cred.private_key
  },
  projectId: cred.project_id
});
client.textDetection({ image: { content: Buffer.from('test') } })
  .then(() => console.log('✅ API ishlayapti'))
  .catch(e => console.error('❌ Xato:', e.message));
"
```

## Eng keng tarqalgan sabab:

**Service Account'da "Cloud Vision AI Service Agent" role yo'q.**

Bu role'ni qo'shish:
1. Google Cloud Console > IAM & Admin > Service Accounts
2. Service account'ni tanlang
3. Permissions > Grant Access
4. Role: `Cloud Vision AI Service Agent`
5. Save

## Keyin qayta urinib ko'ring:

Backend server'ni qayta ishga tushiring va test qiling.

