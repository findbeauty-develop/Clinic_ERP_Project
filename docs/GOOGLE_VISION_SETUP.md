# Google Cloud Vision OCR Setup for Supplier Backend

This guide explains how to set up Google Cloud Vision API for OCR functionality in the supplier backend.

## Prerequisites

1. Google Cloud Platform account
2. A project with Vision API enabled
3. Service account with Vision API permissions

## Setup Steps

### 1. Enable Vision API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to "APIs & Services" > "Library"
4. Search for "Cloud Vision API"
5. Click "Enable"

### 2. Create Service Account

1. Go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Fill in the details:
   - Name: `supplier-vision-service`
   - Description: `Service account for supplier OCR`
4. Click "Create and Continue"
5. Grant role: **Cloud Vision AI Service Agent**
6. Click "Done"

### 3. Create and Download Key

1. Click on the created service account
2. Go to "Keys" tab
3. Click "Add Key" > "Create new key"
4. Select "JSON" format
5. Download the key file
6. Save it as `apps/supplier-backend/keys/clinic-erp-project-02129d68728d.json` (or use the same key as clinic backend)

### 4. Set Environment Variable

Add to `apps/supplier-backend/.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=./keys/clinic-erp-project-02129d68728d.json
```

Or use absolute path:

```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/keys/clinic-erp-project-02129d68728d.json
```

### 5. Test OCR

Upload a business registration certificate image via the `/supplier/manager/upload-certificate` endpoint. The response will include OCR results.

## Troubleshooting

- **Error: "Google Cloud Vision service is not available"**
  - Check `GOOGLE_APPLICATION_CREDENTIALS` is set correctly
  - Verify the JSON key file exists and is valid
  - Ensure the service account has Vision API permissions

- **Error: "Permission denied"**
  - Verify the service account has "Cloud Vision AI Service Agent" role
  - Check Vision API is enabled for your project

## Notes

- The same Google Cloud credentials can be shared between clinic and supplier backends
- OCR processing happens automatically when uploading certificate images
- Parsed fields include: company name, business number, representative name, business type, business item, and address

