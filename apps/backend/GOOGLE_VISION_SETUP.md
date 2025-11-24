# Google Cloud Vision OCR Setup Guide

## 1. Google Cloud Vision API Setup

### Step 1: Enable Vision API
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. Navigate to **APIs & Services** > **Library**
4. Search for "Cloud Vision API"
5. Click **Enable**

### Step 2: Create Service Account
1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Fill in:
   - Name: `clinic-ocr-service`
   - Description: `Service account for clinic certificate OCR`
4. Click **Create and Continue**
5. Grant role: **Cloud Vision API User**
6. Click **Done**

### Step 3: Create and Download JSON Key
1. Click on the created service account
2. Go to **Keys** tab
3. Click **Add Key** > **Create new key**
4. Select **JSON** format
5. Click **Create** (JSON file will be downloaded)

### Step 4: Save JSON Key
1. Create directory: `apps/backend/keys/`
2. Save the downloaded JSON file as: `apps/backend/keys/google-vision.json`
3. **Important**: Add to `.gitignore` to prevent committing credentials

## 2. Environment Configuration

Add to `apps/backend/.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=./keys/google-vision.json
```

Or use absolute path:
```env
GOOGLE_APPLICATION_CREDENTIALS=/full/path/to/apps/backend/keys/google-vision.json
```

## 3. Verify Setup

### Test the endpoint:
```bash
curl -X POST http://localhost:3000/iam/members/clinics/verify-certificate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/certificate.jpg"
```

### Expected Response:
```json
{
  "isValid": true,
  "confidence": 0.8,
  "fields": {
    "clinicName": "예시 클리닉",
    "clinicType": "의원",
    "address": "서울특별시 강남구...",
    "department": "피부과",
    "openDate": "2020-09-04",
    "doctorName": "홍길동",
    "doctorLicenseNo": "12345",
    "reportNumber": "2020-001"
  },
  "rawText": "전체 OCR 텍스트...",
  "warnings": []
}
```

## 4. Troubleshooting

### Error: "Google Cloud Vision client is not initialized"
- Check `GOOGLE_APPLICATION_CREDENTIALS` environment variable
- Verify JSON file path is correct
- Ensure JSON file has valid credentials

### Error: "Failed to extract text from image"
- Check Vision API is enabled in Google Cloud Console
- Verify service account has "Cloud Vision API User" role
- Check billing is enabled for the project

### Error: "Invalid file type"
- Only JPG, PNG, and WebP images are supported
- Maximum file size: 10MB

## 5. Cost Considerations

Google Cloud Vision API pricing:
- First 1,000 units/month: Free
- After that: ~$1.50 per 1,000 images

Monitor usage in Google Cloud Console > Billing

