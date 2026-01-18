# CSV Import Feature - Testing Guide

## Feature Overview
Bulk product import via CSV files with preview, validation, and flexible import modes.

## Test Files Created
1. `test_products_valid.csv` - All valid data (3 products)
2. `test_products_duplicate.csv` - Duplicate barcode error (2 products with same barcode)
3. `test_products_errors.csv` - Missing required fields (name, brand, category)

## Testing Checklist

### 1. Valid CSV Import ✅
**File:** `test_products_valid.csv`

**Steps:**
1. Navigate to `/inventory/products` page
2. Click "📦 CSV Import" button
3. Upload `test_products_valid.csv`
4. Wait for preview validation
5. Verify summary: Total: 3, Valid: 3, Errors: 0
6. Click "Import (3개 제품)" button
7. Verify success message
8. Refresh products page
9. Confirm 3 new products appeared

**Expected Result:**
- ✅ All 3 products imported successfully
- ✅ Products visible in products list
- ✅ Batches created with correct quantities
- ✅ Modal closes automatically

---

### 2. Duplicate Barcode Error ❌
**File:** `test_products_duplicate.csv`

**Steps:**
1. Click "📦 CSV Import" button
2. Upload `test_products_duplicate.csv`
3. Wait for preview validation
4. Verify summary: Total: 3, Valid: 0, Errors: 3
5. Check error list shows "Barcode DUPLICATE123 appears multiple times in CSV"
6. Try to import in "Strict Mode"
7. Verify "Import" button is disabled

**Expected Result:**
- ❌ Strict mode prevents import
- ✅ Error clearly displayed
- ✅ Can select "Flexible Mode" to skip errors
- ✅ In Flexible mode, only valid rows would import (row 3 with no barcode)

---

### 3. Missing Required Fields ❌
**File:** `test_products_errors.csv`

**Steps:**
1. Click "📦 CSV Import" button
2. Upload `test_products_errors.csv`
3. Wait for preview validation
4. Verify errors for each row:
   - Row 1: "Name is required"
   - Row 2: "Brand is required"
   - Row 3: "Category is required"
5. Select "Flexible Mode"
6. Verify import button is still disabled (no valid rows)

**Expected Result:**
- ❌ All rows have errors
- ✅ Errors clearly displayed with row numbers
- ✅ Import blocked even in flexible mode (0 valid rows)

---

### 4. Duplicate Barcode in Database 🔍
**Steps:**
1. Import `test_products_valid.csv` (first time)
2. Wait for success
3. Import `test_products_valid.csv` AGAIN (second time)
4. Verify errors: "Barcode 1234567890 already exists in database"
5. Verify errors: "Barcode 0987654321 already exists in database"

**Expected Result:**
- ❌ Duplicate barcodes detected from database
- ✅ Clear error messages
- ✅ Row 3 (no barcode) is still valid in flexible mode

---

### 5. Large File Test (Optional) 📊
**Steps:**
1. Create CSV with 1000+ rows (use Excel/Google Sheets)
2. Upload file
3. Verify batching works (100 rows/batch)
4. Monitor console for batch processing logs
5. Verify all products imported

**Expected Result:**
- ✅ Handles large files without timeout
- ✅ Batch processing prevents database overload
- ✅ Progress visible (though no UI progress bar yet)

---

### 6. CSV Template Download 📄
**Steps:**
1. Click "📦 CSV Import" button
2. Click "템플릿 다운로드" button
3. Open downloaded file
4. Verify headers match required format
5. Verify example data is present

**Expected Result:**
- ✅ Template downloads successfully
- ✅ Headers correct (17 columns)
- ✅ Example rows included
- ✅ UTF-8 encoding (Korean characters display correctly)

---

### 7. Invalid Date Format ❌
**Test CSV:**
```csv
name,brand,category,inbound_qty,unit,min_stock,capacity_per_product,capacity_unit,usage_capacity,expiry_date,alert_days,contact_phone,refund_amount,storage,barcode,purchase_price,sale_price
Test,Brand,Category,100,EA,10,50,ml,5,2026/12/31,30,010-1234-5678,10000,냉장,TEST999,5000,8000
```

**Expected Result:**
- ❌ Error: "Expiry date must be in YYYY-MM-DD format"
- ✅ Row blocked from import

---

### 8. Negative Values ❌
**Test CSV:**
```csv
name,brand,category,inbound_qty,unit,min_stock,capacity_per_product,capacity_unit,usage_capacity,expiry_date,alert_days,contact_phone,refund_amount,storage,barcode,purchase_price,sale_price
Test,Brand,Category,-100,EA,10,50,ml,5,2026-12-31,30,010-1234-5678,10000,냉장,TEST888,5000,8000
```

**Expected Result:**
- ❌ Error: "Inbound quantity cannot be negative"
- ✅ Validation blocks import

---

### 9. Optional Prices (Null Values) ✅
**Test CSV:**
```csv
name,brand,category,inbound_qty,unit,min_stock,capacity_per_product,capacity_unit,usage_capacity,expiry_date,alert_days,contact_phone,refund_amount,storage,barcode,purchase_price,sale_price
Test,Brand,Category,100,EA,10,50,ml,5,2026-12-31,30,010-1234-5678,10000,냉장,TEST777,,
```

**Expected Result:**
- ✅ Import succeeds
- ✅ `purchase_price` and `sale_price` set to `null`
- ✅ Product appears in products list
- ✅ Prices show as ₩0 or empty

---

### 10. Flexible vs Strict Mode 🔄
**Test CSV with mixed data:**
```csv
name,brand,category,inbound_qty,unit,min_stock,capacity_per_product,capacity_unit,usage_capacity,expiry_date,alert_days,contact_phone,refund_amount,storage,barcode,purchase_price,sale_price
ValidProduct,Brand,Category,100,EA,10,50,ml,5,2026-12-31,30,010-1234-5678,10000,냉장,VALID001,5000,8000
,Brand,Category,100,EA,10,50,ml,5,2026-12-31,30,010-1234-5678,10000,냉장,INVALID001,5000,8000
AnotherValid,Brand,Category,200,BOX,20,100,개,10,2027-06-30,60,010-9876-5432,15000,상온,VALID002,7000,12000
```

**Strict Mode:**
- ❌ Import blocked (1 invalid row)
- ✅ Error message: "Cannot import in strict mode with 1 validation errors"

**Flexible Mode:**
- ✅ Import succeeds with 2 products
- ✅ Success message: "Total: 3, Success: 2, Failed: 1"
- ✅ Invalid row skipped

---

## API Testing (Postman/Insomnia)

### 1. Preview Endpoint
```http
POST http://localhost:3000/products/import/preview
Authorization: Bearer <token>
Content-Type: application/json

{
  "rows": [
    {
      "name": "Test Product",
      "brand": "Test Brand",
      "category": "Test Category",
      "inbound_qty": 100,
      "unit": "EA",
      "min_stock": 10,
      "capacity_per_product": 50,
      "capacity_unit": "ml",
      "usage_capacity": 5,
      "expiry_date": "2026-12-31",
      "alert_days": 30,
      "contact_phone": "010-1234-5678",
      "refund_amount": 10000,
      "storage": "냉장",
      "barcode": "TEST123",
      "purchase_price": 5000,
      "sale_price": 8000
    }
  ]
}
```

**Expected Response:**
```json
{
  "total": 1,
  "valid": 1,
  "errors": 0,
  "results": [
    {
      "row": 1,
      "data": { ... },
      "valid": true,
      "errors": []
    }
  ]
}
```

### 2. Confirm Import Endpoint
```http
POST http://localhost:3000/products/import/confirm
Authorization: Bearer <token>
Content-Type: application/json

{
  "rows": [ ... same as preview ... ],
  "mode": "strict"  // or "flexible"
}
```

**Expected Response:**
```json
{
  "success": true,
  "total": 1,
  "imported": 1,
  "failed": 0
}
```

---

## Known Limitations
1. **Max 10,000 rows** per import (safety limit)
2. **Batch size: 100 rows** (prevents database overload)
3. **Timeout: 5 minutes** per import
4. **Unit field**: Free text, not enum (dynamic)
5. **Barcode**: Optional but must be unique if provided

---

## Safety Features Implemented ✅
- ✅ Transaction per batch (data integrity)
- ✅ Duplicate barcode check (database + CSV)
- ✅ Required field validation
- ✅ Date format validation
- ✅ Negative value prevention
- ✅ Size limit (10,000 rows)
- ✅ Batch processing (100 rows/batch)
- ✅ Timeout protection (5 minutes)
- ✅ Delay between batches (100ms)
- ✅ Cache clearing after import

---

## Next Steps (Future Enhancements)
1. **Bulk Price Update Page** (`/products/pricing`)
   - Edit prices for imported products
   - Multi-select and bulk edit
   - CSV export/import for prices only
2. **Progress Bar** for large imports
3. **Background Jobs** for very large files (10,000+ rows)
4. **Import History** log
5. **Undo/Rollback** feature

---

## Troubleshooting

### Import fails with "Tenant ID is required"
- Check JWT token validity
- Verify token contains `tenant_id` claim

### Products not appearing after import
- Check browser console for errors
- Verify cache was cleared (`productsCache.clear()`)
- Refresh page manually
- Check database for imported products

### "CSV parse error"
- Verify file encoding (UTF-8 with BOM)
- Check for special characters
- Ensure headers match template exactly
- No extra columns or spaces

### Database timeout
- Reduce import size (< 1000 rows)
- Check database connection
- Verify Supabase IP allowlist

---

## Test Summary

| Test Case | Status | Notes |
|-----------|--------|-------|
| Valid CSV Import | ✅ Ready | 3 products |
| Duplicate Barcode | ✅ Ready | Within CSV |
| Missing Fields | ✅ Ready | Name, brand, category |
| Duplicate in DB | ✅ Ready | Re-import test |
| Large File | 🟡 Manual | Create 1000+ rows |
| Template Download | ✅ Ready | Built-in |
| Invalid Date | ✅ Ready | Format validation |
| Negative Values | ✅ Ready | Min value check |
| Null Prices | ✅ Ready | Optional fields |
| Flexible Mode | ✅ Ready | Skip invalid |

**Overall Status: ✅ READY FOR TESTING**

---

## How to Run Tests

1. **Start Backend:**
   ```bash
   cd apps/backend
   npm run dev
   ```

2. **Start Frontend:**
   ```bash
   cd apps/frontend
   npm run dev
   ```

3. **Navigate to:**
   ```
   http://localhost:3001/inventory/products
   ```

4. **Upload Test Files:**
   - `test_products_valid.csv`
   - `test_products_duplicate.csv`
   - `test_products_errors.csv`

5. **Verify Results:**
   - Check modal preview
   - Verify validation errors
   - Test import modes
   - Confirm products appear

---

**Implementation Complete! 🎉**

