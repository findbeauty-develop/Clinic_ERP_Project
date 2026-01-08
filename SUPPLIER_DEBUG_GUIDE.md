# Supplier Manual Edit - Debugging Guide

## Problem
ClinicSupplierManager jadvaliga yangi supplier qo'shilmayapti.

## Debugging Logs Added

### Frontend Logs (Browser Console)

#### 1. Form Submission Check
```
Form submitted {...}
🔍 showNewSupplierModal: true/false
🔍 selectedSupplierDetails: {...}
```

#### 2. Validation Logs
```
🔍 Manual supplier form validation starting...
🔍 supplierSearchManagerName: "김철수"
🔍 pendingSupplierPhone: "010-1234-5678"
🔍 newSupplierForm.companyName: "테스트공급업체"
✅ Manual supplier form validation passed!
```

#### 3. Payload Creation Logs
```
🔍 Manual supplier form detected!
🔍 supplierSearchManagerName: "김철수"
🔍 pendingSupplierPhone: "010-1234-5678"
🔍 newSupplierForm: {
  companyName: "테스트공급업체",
  businessNumber: "123-45-67890",
  companyPhone: "02-1234-5678",
  companyEmail: "test@example.com",
  companyAddress: "서울시...",
  responsibleProducts: "의약품",
  memo: "메모"
}
✅ Supplier payload created: [{...}]
```

### Backend Logs (Terminal/Docker Logs)

#### 1. Received Data
```
🔍 Backend: Received supplier data: {
  "supplier_id": null,
  "company_name": "테스트공급업체",
  "business_number": "123-45-67890",
  "company_phone": "02-1234-5678",
  "company_email": "test@example.com",
  "company_address": "서울시...",
  "contact_name": "김철수",
  "contact_phone": "010-1234-5678",
  "contact_email": "test@example.com"
}
```

#### 2. Search Logs
```
🔍 Searching by phone: 010-1234-5678
🔍 Found by phone? NO

🔍 Searching by business number: 123-45-67890
🔍 Found by business? NO
```

#### 3. Creation Path
```
🆕 Creating NEW supplier manager...
🔍 Validating phone uniqueness: 010-1234-5678
✅ Phone is unique
🔍 Validating business number uniqueness: 123-45-67890
✅ Business number is unique
📝 Creating with data: {
  "tenant_id": "...",
  "company_name": "테스트공급업체",
  "business_number": "123-45-67890",
  "company_phone": "02-1234-5678",
  "company_email": "test@example.com",
  "company_address": "서울시...",
  "name": "김철수",
  "phone_number": "010-1234-5678",
  "email1": "test@example.com"
}
✅ NEW Supplier created! ID: uuid-xxx-xxx
🔗 Upserting ProductSupplier link...
✅ ProductSupplier link created/updated successfully!
```

#### 4. Update Path (if exists)
```
✅ Updating existing supplier: uuid-xxx-xxx
🔗 Upserting ProductSupplier link...
✅ ProductSupplier link created/updated successfully!
```

## Debugging Steps

### Step 1: Check Frontend Form State

Open browser console and check:

1. **Is showNewSupplierModal true?**
   ```
   Look for: 🔍 showNewSupplierModal: true
   ```
   - If `false`, form won't submit supplier data
   - Solution: Make sure you click "수정" and search non-existent supplier

2. **Are all fields filled?**
   ```
   Look for: 🔍 newSupplierForm: {...}
   ```
   - If any field is empty, validation will fail
   - Solution: Fill all required fields

3. **Does validation pass?**
   ```
   Look for: ✅ Manual supplier form validation passed!
   ```
   - If not, you'll see alert message
   - Solution: Check which field is missing

4. **Is payload created?**
   ```
   Look for: ✅ Supplier payload created: [{...}]
   ```
   - If not created, check `showNewSupplierModal` and `newSupplierForm.companyName`
   - Solution: Ensure both are set correctly

### Step 2: Check Backend Logs

View backend terminal/docker logs:

```bash
# Local development
cd apps/backend && pnpm start:dev

# Docker
docker logs clinic-erp-backend-prod -f
```

1. **Is data received?**
   ```
   Look for: 🔍 Backend: Received supplier data: {...}
   ```
   - If not received, check API request in Network tab
   - Solution: Ensure frontend sends `suppliers` array in payload

2. **Does search execute?**
   ```
   Look for: 🔍 Searching by phone: ...
   ```
   - If not searching, `contact_phone` might be null
   - Solution: Ensure `pendingSupplierPhone` is set in frontend

3. **Is supplier found?**
   ```
   Look for: 🔍 Found by phone? NO
   ```
   - If `YES`, supplier already exists (UPDATE path)
   - If `NO`, will create new (CREATE path)

4. **Does creation start?**
   ```
   Look for: 🆕 Creating NEW supplier manager...
   ```
   - If not appearing, supplier was found (UPDATE path)
   - Check existing records in database

5. **Does validation pass?**
   ```
   Look for: ✅ Phone is unique
   ```
   - If validation fails, you'll see `❌` message
   - Solution: Phone or business number already exists

6. **Is supplier created?**
   ```
   Look for: ✅ NEW Supplier created! ID: uuid-xxx-xxx
   ```
   - If error occurs, check error message
   - Common errors: database connection, invalid data format

7. **Is ProductSupplier link created?**
   ```
   Look for: ✅ ProductSupplier link created/updated successfully!
   ```
   - This confirms the mapping is complete
   - Product is now linked to supplier

### Step 3: Verify Database

Check ClinicSupplierManager table:

```sql
SELECT * FROM "ClinicSupplierManager" 
WHERE phone_number = '010-1234-5678';
```

Expected result: 1 row with all supplier details

Check ProductSupplier table:

```sql
SELECT ps.*, csm.company_name 
FROM "ProductSupplier" ps
JOIN "ClinicSupplierManager" csm ON ps.clinic_supplier_manager_id = csm.id
WHERE ps.product_id = '<your-product-id>';
```

Expected result: 1 row linking product to supplier

### Step 4: Common Issues and Solutions

#### Issue 1: showNewSupplierModal is false
**Symptom:** No supplier payload created
**Solution:** 
1. Click "수정" button in supplier section
2. Search for non-existent phone number
3. Form should appear (`showNewSupplierModal = true`)

#### Issue 2: pendingSupplierPhone is empty
**Symptom:** Validation fails with alert
**Solution:**
1. Enter phone number in search field
2. Click search button
3. `pendingSupplierPhone` should be set automatically

#### Issue 3: supplierSearchManagerName is empty
**Symptom:** Validation fails with alert
**Solution:**
1. Fill "담당자 이름" field in manual form
2. State should update: `supplierSearchManagerName: "김철수"`

#### Issue 4: Backend search finds existing supplier
**Symptom:** Logs show "Found by phone? YES" but data not updated
**Solution:**
- This is UPDATE path, not CREATE
- Supplier exists, data is being updated
- Check updated values in database

#### Issue 5: Uniqueness validation fails
**Symptom:** Error "이 전화번호(...)는 이미 등록되어 있습니다."
**Solution:**
- Phone number already exists for this tenant
- Use different phone number
- Or update existing supplier instead

#### Issue 6: Transaction rolls back
**Symptom:** Database changes not saved
**Solution:**
- Check backend error logs
- Look for Prisma errors
- Ensure all required fields are provided
- Check database constraints

## Complete Test Flow

### 1. Open Product Edit Page
```
http://localhost:3000/products/{product-id}
```

### 2. Open Browser Console
Press `F12` or `Cmd+Option+I`

### 3. Click "수정" in Supplier Section

### 4. Search Non-Existent Supplier
Enter phone: `010-9999-9999`
Click search button

**Expected Console:**
```
Phone search results: []
```

### 5. Manual Form Appears
Check console:
```
🔍 showNewSupplierModal: true
```

### 6. Fill All Fields
- 담당자 이름: "김철수"
- 핸드폰 번호: "010-9999-9999" (auto-filled)
- 회사명: "테스트공급업체"
- 사업자 등록번호: "999-88-77666"
- 회사 전화번호: "02-9999-8888"
- 이메일: "test@supplier.com"
- 회사 주소: "서울시 테스트구"
- 담당 제품: "의약품"

### 7. Click Save Button

**Expected Frontend Console:**
```
🔍 showNewSupplierModal: true
🔍 Manual supplier form validation starting...
✅ Manual supplier form validation passed!
🔍 Manual supplier form detected!
✅ Supplier payload created: [{...}]
📦 Payload being sent to backend: {...}
```

**Expected Backend Console:**
```
🔍 Backend: Received supplier data: {...}
🔍 Searching by phone: 010-9999-9999
🔍 Found by phone? NO
🆕 Creating NEW supplier manager...
✅ Phone is unique
✅ Business number is unique
📝 Creating with data: {...}
✅ NEW Supplier created! ID: uuid-xxx-xxx
🔗 Upserting ProductSupplier link...
✅ ProductSupplier link created/updated successfully!
```

### 8. Verify Success
- Success message appears
- View changes to table mode
- Supplier info displayed in table

### 9. Verify Database
```sql
SELECT * FROM "ClinicSupplierManager" 
WHERE phone_number = '010-9999-9999';
```

Should return 1 row with:
- company_name: "테스트공급업체"
- business_number: "999-88-77666"
- phone_number: "010-9999-9999"
- name: "김철수"
- etc.

## Summary

With these debug logs, you can now:

1. ✅ See if form submits correctly
2. ✅ Verify validation passes
3. ✅ Check if payload is created
4. ✅ Monitor backend receives data
5. ✅ Track database search
6. ✅ Confirm CREATE/UPDATE path
7. ✅ Verify supplier creation
8. ✅ Confirm ProductSupplier link

**All logs added with emojis for easy identification!**

🔍 = Inspection/Check
✅ = Success
❌ = Error/Failure
🆕 = Create New
📝 = Writing Data
🔗 = Linking/Relation

## Next Steps

1. Test with real data
2. Check console logs at each step
3. Copy relevant logs if issue persists
4. Share logs for further debugging

