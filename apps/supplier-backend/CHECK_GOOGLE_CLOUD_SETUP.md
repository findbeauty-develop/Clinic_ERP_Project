# Google Cloud Vision Setup Tekshirish

## Muammo: `16 UNAUTHENTICATED` Error

Credentials fayl to'g'ri, lekin API chaqiruvi rad etilmoqda. Bu service account'da yetarli permissions yo'qligini ko'rsatadi.

## Tekshirish va Tuzatish:

### 1. Google Cloud Console'ga kiring
https://console.cloud.google.com/

### 2. Project'ni tanlang
- Project: `clinic-erp-project`

### 3. Service Account Permissions'ni tekshiring

**Yo'l:**
1. **IAM & Admin** > **Service Accounts** ga o'ting
2. `clinic-ocr-service@clinic-erp-project.iam.gserviceaccount.com` ni toping
3. Service account'ga bosing
4. **Permissions** tab'ni oching

**Kutilayotgan Role:**
- ✅ **Cloud Vision AI Service Agent** (yoki)
- ✅ **Cloud Vision API User** (yoki)
- ✅ **Editor** (full access)

**Agar role yo'q bo'lsa:**
1. **Grant Access** tugmasini bosing
2. **Add Principal** ga bosing
3. Service account email'ni kiriting: `clinic-ocr-service@clinic-erp-project.iam.gserviceaccount.com`
4. **Role** dropdown'dan tanlang: `Cloud Vision AI Service Agent`
5. **Save** tugmasini bosing

### 4. Vision API'ni yoqing

**Yo'l:**
1. **APIs & Services** > **Library** ga o'ting
2. "Cloud Vision API" ni qidiring
3. Agar "Enable" tugmasi ko'rinsa, bosing
4. Agar "Manage" ko'rinsa, API yoqilgan

### 5. Billing'ni tekshiring

**Yo'l:**
1. **Billing** > **Account management** ga o'ting
2. Billing account active ekanligini tekshiring
3. Agar yo'q bo'lsa, billing account'ni ulang

### 6. Test qiling

Service account'ga role qo'shgandan keyin, 5-10 daqiqa kutib, keyin qayta test qiling:

```bash
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
2. `clinic-ocr-service@clinic-erp-project.iam.gserviceaccount.com` ni tanlang
3. Permissions > Grant Access
4. Role: `Cloud Vision AI Service Agent`
5. Save

## Qo'shimcha tekshirish:

Agar hali ham ishlamasa, quyidagilarni tekshiring:

1. **Service Account Key yangi yaratish:**
   - Eski key o'chirib, yangi key yarating
   - Yangi key'ni faylga saqlang

2. **Project ID'ni tekshiring:**
   - Credentials faylda `project_id: "clinic-erp-project"` bo'lishi kerak
   - Google Cloud Console'dagi project ID bilan bir xil bo'lishi kerak

3. **API Quotas:**
   - APIs & Services > Quotas
   - Vision API quotas'ni tekshiring

