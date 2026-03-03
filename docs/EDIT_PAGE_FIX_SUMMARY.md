# Edit Page Update Fix Summary

## 🔧 Problem
The following fields were NOT being saved to database when editing a product:
- 제품 재고 수량 (Product Stock Quantity)
- 유효기간 (Expiry Date)
- 유통기한 임박 알림 기준 (Alert Days)
- 보관 위치 (Storage Location)
- 공급업체 정보 (Supplier Information)

## ✅ Root Cause
Backend was using `dto.field !== undefined ? dto.field : undefined` which prevented Prisma from updating fields. Prisma ignores `undefined` values and only updates when explicit values or `null` are provided.

## 🛠️ Changes Made

### 1. Backend DTO (`create-product.dto.ts`)
**Added:**
```typescript
@IsOptional()
@IsString()
expiryDate?: string; // Product-level expiry date
```

**Fixed:**
```typescript
@IsOptional()
@IsNumber() // Changed from @IsInt() to support Float
@Min(0)
usageCapacity?: number;
```

### 2. Backend Service (`products.service.ts`)
**Fixed update logic using spread operator:**
```typescript
...(dto.storage !== undefined && { storage: dto.storage }),
...(dto.inboundManager !== undefined && { inbound_manager: dto.inboundManager }),
...(dto.alertDays !== undefined && { alert_days: dto.alertDays }),
...(dto.expiryDate !== undefined && { 
  expiry_date: dto.expiryDate ? new Date(dto.expiryDate) : null 
}),
```

**Added logging:**
```typescript
console.log("📥 Received DTO for product update:", JSON.stringify(dto, null, 2));
```

### 3. Frontend (`products/[id]/page.tsx`)
**Added to payload:**
```typescript
// Expiry date
if (formData.expiryDate) {
  payload.expiryDate = formData.expiryDate;
}
```

**Added logging:**
```typescript
console.log("📦 Payload being sent to backend:", JSON.stringify(payload, null, 2));
```

### 4. Database Schema (`schema.prisma`)
**Added to Product model:**
```prisma
expiry_date   DateTime? // 유효기간 (Product-level expiry date)
```

### 5. Migration
**Created:** `20260107120000_add_expiry_date_to_product/migration.sql`
```sql
ALTER TABLE "Product" ADD COLUMN "expiry_date" TIMESTAMP(3);
```

## 🚀 Deployment Steps

### Local Testing
```bash
cd /Users/Development/Desktop/Clinic_ERP_Project

# Test backend
cd apps/backend
pnpm run start:dev

# Test frontend
cd ../frontend
pnpm run dev
```

### VPS Deployment

#### Option 1: Apply Migration Directly
```bash
# SSH to VPS
ssh -i ~/.ssh/seoul-clinic.pem ubuntu@<VPS_IP>

# Apply migration
cd ~/clinic-erp
docker-compose -f docker-compose.prod.yml exec backend sh
cd /app/apps/backend
npx prisma migrate deploy
exit
```

#### Option 2: Full Rebuild (Recommended)
```bash
# Local: Rebuild backend image
cd /Users/Development/Desktop/Clinic_ERP_Project
docker build -t findbeauty/clinic-backend:latest \
  --platform linux/amd64 \
  -f apps/backend/Dockerfile .

# Push to Docker Hub
docker push findbeauty/clinic-backend:latest

# VPS: Pull and restart
ssh -i ~/.ssh/seoul-clinic.pem ubuntu@<VPS_IP>
cd ~/clinic-erp
docker-compose -f docker-compose.prod.yml pull backend
docker-compose -f docker-compose.prod.yml up -d backend
docker-compose -f docker-compose.prod.yml logs -f backend
```

## 🧪 Testing Checklist

After deployment, test the following:

1. **제품 재고 수량 (Product Stock)**
   - [ ] Edit and save a product's stock quantity
   - [ ] Verify it persists in database
   - [ ] Verify it displays correctly after page refresh

2. **유효기간 (Expiry Date)**
   - [ ] Set an expiry date
   - [ ] Verify it saves to database
   - [ ] Verify it displays correctly

3. **유통기한 임박 알림 기준 (Alert Days)**
   - [ ] Set alert days value
   - [ ] Verify it saves
   - [ ] Verify it displays correctly

4. **보관 위치 (Storage Location)**
   - [ ] Update storage location
   - [ ] Verify it saves
   - [ ] Verify it displays correctly

5. **공급업체 정보 (Supplier Information)**
   - [ ] Update supplier details
   - [ ] Verify ClinicSupplierManager updates
   - [ ] Verify ProductSupplier relationship updates

6. **구매가 (Purchase Price)**
   - [ ] Update purchase price
   - [ ] Verify it saves
   - [ ] Verify it displays correctly

## 📝 Debug Commands

```bash
# Check backend logs
docker-compose -f docker-compose.prod.yml logs -f backend | grep "📥 Received DTO"

# Check if migration applied
docker-compose -f docker-compose.prod.yml exec backend sh
psql $DATABASE_URL -c "\d Product" | grep expiry_date

# Check product data
psql $DATABASE_URL -c "SELECT id, name, storage, alert_days, expiry_date FROM \"Product\" LIMIT 5;"
```

## 🎯 Expected Console Output

**Frontend (before save):**
```
📦 Payload being sent to backend: {
  "name": "Test Product",
  "currentStock": 100,
  "storage": "냉장고",
  "alertDays": "7",
  "expiryDate": "2025-12-31",
  "suppliers": [...]
}
```

**Backend (on receive):**
```
📥 Received DTO for product update: {
  "name": "Test Product",
  "currentStock": 100,
  "storage": "냉장고",
  "alertDays": "7",
  "expiryDate": "2025-12-31",
  "suppliers": [...]
}
```

## ✅ Success Criteria

All fields should:
1. Accept user input
2. Send to backend in payload
3. Be received by backend DTO
4. Update in database via Prisma
5. Display correctly after page refresh

---

**Status:** Ready for deployment
**Date:** 2026-01-08
**Priority:** High

