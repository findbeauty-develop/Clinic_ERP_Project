# HIRA API Setup Guide

## Overview
HIRA (건강보험심사평가원) API integration for verifying medical institution certificates.

## 1. Get HIRA API Credentials

### Step 1: Access data.go.kr
1. Go to [data.go.kr](https://www.data.go.kr)
2. Sign in with your account

### Step 2: Find HIRA API
1. Search for "건강보험심사평가원_병원정보서비스" or "HIRA 병원정보"
2. Click on the API service
3. Click "활용신청" or "API 신청" if required

### Step 3: Get API Information
1. Copy the **Service Key** (서비스키)
2. Copy the **API Endpoint URL** (요청 URL)
   - Should look like: `https://apis.data.go.kr/B551182/hospInfoService/v2`
   - Or: `https://apis.data.go.kr/B551182/hospInfoService/v2/getHospBasisList`

## 2. Environment Configuration

Add to `apps/backend/.env`:

```env
# HIRA API Configuration
HIRA_API_KEY=your_service_key_from_data_go_kr
HIRA_API_URL=https://apis.data.go.kr/B551182/hospInfoService/v2
```

### Important Notes:
- `HIRA_API_KEY`: Your service key from data.go.kr
- `HIRA_API_URL`: Base URL for HIRA API (without endpoint path)
- If `HIRA_API_KEY` is not set, HIRA verification will be skipped (OCR-only verification will still work)

## 3. How It Works

### Certificate Verification Flow:
1. **OCR Extraction**: Extract text from certificate image using Google Cloud Vision
2. **Field Parsing**: Parse certificate fields (clinic name, address, type, date, etc.)
3. **HIRA Verification**: 
   - Search HIRA database using clinic name
   - Compare certificate data with HIRA data
   - Calculate match confidence
4. **Combined Result**: 
   - OCR validity + HIRA validity
   - Combined confidence score (40% OCR, 60% HIRA)
   - Warnings from both OCR and HIRA

### Verification Checks:
- **Clinic Name**: Fuzzy match between certificate and HIRA
- **Address**: Normalized address comparison
- **Clinic Type**: Compare clinic type (의원, 병원, etc.)
- **Open Date**: Compare establishment date

## 4. API Endpoints

### Certificate Verification (Existing)
```
POST /iam/members/clinics/verify-certificate
```
Now includes HIRA verification results in response.

### HIRA Search (New)
```
GET /hira/search?yadmNm=닥터정리반의원&sidoCd=11
```
Search hospitals using HIRA API.

## 5. Response Structure

### Verify Certificate Response (Updated)
```json
{
  "isValid": true,
  "confidence": 0.9,
  "fields": {
    "clinicName": "닥터정리반의원",
    "address": "서울특별시 강남구...",
    ...
  },
  "hiraVerification": {
    "isValid": true,
    "confidence": 0.95,
    "matches": {
      "nameMatch": true,
      "addressMatch": true,
      "typeMatch": true,
      "dateMatch": false
    },
    "hiraData": {
      "yadmNm": "닥터정리반의원",
      "addr": "서울특별시 강남구...",
      "clcdNm": "의원",
      "telno": "02-1234-5678"
    },
    "warnings": []
  }
}
```

## 6. Troubleshooting

### HIRA API Not Working
- Check `HIRA_API_KEY` is set correctly in `.env`
- Verify API endpoint URL is correct
- Check API rate limits
- Verify service key is active

### HIRA Verification Skipped
- If `HIRA_API_KEY` is not set, verification will be skipped
- OCR verification will still work
- Check logs for HIRA-related warnings

### Low Confidence Scores
- Certificate data might not match HIRA database
- Check warnings for specific mismatches
- Verify clinic name spelling
- Check address format

## 7. Testing

### Test Certificate Verification:
```bash
curl -X POST http://localhost:3000/iam/members/clinics/verify-certificate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/certificate.jpg"
```

### Test HIRA Search:
```bash
curl -X GET "http://localhost:3000/hira/search?yadmNm=닥터정리반의원" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 8. Notes

- HIRA verification is optional - if it fails, OCR verification still works
- Confidence score combines OCR (40%) and HIRA (60%) results
- Address and name matching uses fuzzy logic to handle minor differences
- All HIRA errors are logged but don't fail the verification process

