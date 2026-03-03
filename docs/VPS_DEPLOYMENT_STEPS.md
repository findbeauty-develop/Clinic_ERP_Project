# VPS Deployment Steps - CORS and API URL Fix

## ✅ Changes Made (Local)

### 1. **Frontend Dockerfile Updated**

- Added `NEXT_PUBLIC_SUPPLIER_API_URL` build argument
- File: `apps/frontend/Dockerfile`
- Now supports both API URLs at build time

### 2. **Supplier Backend CORS Fixed**

- Updated `apps/supplier-backend/src/main.ts`
- CORS now reads from `CORS_ORIGINS` environment variable
- Logs allowed origins on startup

### 3. **Docker Images Built and Pushed**

✅ `findbeauty/clinic-frontend:latest` - with correct API URLs
✅ `findbeauty/supplier-backend:latest` - with CORS fix

**Build Arguments Used:**

```bash
NEXT_PUBLIC_API_URL=http://13.209.40.48:3000
NEXT_PUBLIC_SUPPLIER_API_URL=http://13.209.40.48:3002
```

---

## 🚀 VPS Deployment Commands

### **Step 1: SSH to Seoul VPS**

```bash
ssh -i ~/.ssh/seoul-clinic.pem ubuntu@13.209.40.48
```

### **Step 2: Navigate to Project Directory**

```bash
cd ~/clinic-erp
```

### **Step 3: Pull New Docker Images**

```bash
docker-compose -f docker-compose.prod.yml pull frontend supplier-backend
```

### **Step 4: Restart Services**

```bash
docker-compose -f docker-compose.prod.yml up -d --force-recreate frontend supplier-backend
```

### **Step 5: Verify Logs**

**Frontend Logs:**

```bash
docker logs -f clinic-erp-frontend-prod
```

**Supplier Backend Logs:**

```bash
docker logs -f supplier-erp-backend-prod
```

**Look for:**

- Frontend: Should start without errors
- Supplier Backend: Should show `✅ CORS enabled for origins: [...]`

---

## 🔍 Verification Steps

### **1. Check Environment Variables**

```bash
# Frontend
docker exec clinic-erp-frontend-prod env | grep NEXT_PUBLIC

# Expected output:
# NEXT_PUBLIC_API_URL=http://13.209.40.48:3000
# NEXT_PUBLIC_SUPPLIER_API_URL=http://13.209.40.48:3002
```

### **2. Test CORS**

```bash
curl -X OPTIONS http://13.209.40.48:3002/supplier/manager/upload-certificate \
  -H "Origin: http://13.209.40.48:3001" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

**Expected response:**

```
< HTTP/1.1 204 No Content
< Access-Control-Allow-Origin: http://13.209.40.48:3001
< Access-Control-Allow-Credentials: true
```

### **3. Test Frontend**

1. Open browser: `http://13.209.40.48:3001/inbound/new`
2. Try to upload business certificate
3. Check browser console (F12) - should NOT see CORS errors
4. Should NOT see "Failed to fetch" errors

---

## 📋 Expected Results

### **Before Fix:**

❌ `POST http://13.209.40.48:3001/supplier/create-manual 404 Not Found`
❌ `CORS policy blocked: localhost:3002 from 13.209.40.48:3001`
❌ `Failed to fetch`

### **After Fix:**

✅ `POST http://13.209.40.48:3000/supplier/create-manual 200 OK`
✅ No CORS errors
✅ Certificate upload works

---

## 🔧 Troubleshooting

### **If frontend still shows wrong URL:**

```bash
# Rebuild and redeploy frontend
docker-compose -f docker-compose.prod.yml build --no-cache frontend
docker-compose -f docker-compose.prod.yml up -d --force-recreate frontend
```

### **If CORS errors persist:**

```bash
# Check supplier-backend logs
docker logs supplier-erp-backend-prod | grep CORS

# Should see:
# ✅ CORS enabled for origins: ['http://13.209.40.48:3001', ...]
```

### **If services won't start:**

```bash
# Check all containers
docker ps -a

# Restart all
docker-compose -f docker-compose.prod.yml restart
```

---

## 📝 Configuration Summary

### **Frontend Environment:**

```
NEXT_PUBLIC_API_URL=http://13.209.40.48:3000
NEXT_PUBLIC_SUPPLIER_API_URL=http://13.209.40.48:3002
```

### **Supplier Backend Environment (from docker-compose.prod.yml):**

```
CORS_ORIGINS=http://13.209.40.48:3001,http://13.209.40.48:3003,http://localhost:3001,http://localhost:3003
```

---

## ✅ Completion Checklist

- [ ] SSH to VPS
- [ ] Pull new images
- [ ] Restart services
- [ ] Check frontend logs (no errors)
- [ ] Check supplier-backend logs (CORS enabled message)
- [ ] Test frontend page (http://13.209.40.48:3001/inbound/new)
- [ ] Test certificate upload
- [ ] Verify no CORS errors in browser console
- [ ] Verify API calls go to correct backend (3000, not 3001)

---

**Date:** January 7, 2026
**VPS IP:** 13.209.40.48 (Seoul)
**Services:** Frontend (3001), Backend (3000), Supplier Backend (3002), Supplier Frontend (3003)
