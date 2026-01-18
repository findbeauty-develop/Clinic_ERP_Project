# CSV Import Feature - Testing Guide (Updated)

## ✅ Final CSV Format (12 Required + 3 Optional Fields)

### Required Fields (12):
1. `name` - 제품명
2. `brand` - 브랜드
3. `category` - 카테고리
4. `inbound_qty` - 입고수량
5. `unit` - 단위 (동적: EA, BOX, 개, 병, etc.)
6. `min_stock` - 최소재고
7. `capacity_per_product` - 용량
8. `capacity_unit` - 용량단위
9. `usage_capacity` - 사용용량
10. `expiry_date` - 유통기한 (YYYY-MM-DD or MM/DD/YYYY)
11. `alert_days` - 경고일수
12. `storage` - 보관위치

### Optional Fields (3):
- `barcode` - 바코드 (unique if provided)
- `purchase_price` - 구매가 (null if empty)
- `sale_price` - 판매가 (null if empty)

## CSV Template

```csv
name,brand,category,inbound_qty,unit,min_stock,capacity_per_product,capacity_unit,usage_capacity,expiry_date,alert_days,storage,barcode,purchase_price,sale_price
시럽A,브랜드A,의약품,100,EA,10,50,ml,5,2026-12-31,30,냉장,1234567890,5000,8000
주사기B,브랜드B,의료기기,200,BOX,20,100,개,10,12/31/2027,60,상온,0987654321,7000,12000
반창고C,브랜드C,의료소모품,300,개,30,200,매,20,2026-09-30,45,상온,,3000,5000
```

**Note:** `expiry_date` accepts both formats:
- `YYYY-MM-DD` (e.g., 2026-12-31)
- `MM/DD/YYYY` (e.g., 12/31/2026)

## Quick Test

**1. Download Template:**
- Click "📦 CSV Import" button
- Click "템플릿 다운로드"
- Opens: `products_template.csv`

**2. Fill Data:**
- Required: All 12 fields
- Optional: barcode, prices (can be empty)

**3. Upload:**
- Drag & drop or click to select
- Wait for validation
- Check preview
- Click "Import"

## Testing Scenarios

### ✅ Valid Import
**Expected:** All products import successfully

### ❌ Missing Required Field
**CSV:**
```csv
name,brand,category,inbound_qty,unit,min_stock,capacity_per_product,capacity_unit,usage_capacity,expiry_date,alert_days,storage
,브랜드A,의약품,100,EA,10,50,ml,5,2026-12-31,30,냉장
```
**Error:** "Name is required"

### ❌ Invalid Date Format
**CSV:**
```csv
...expiry_date...
2026/12/31
```
**Error:** "Expiry date must be in YYYY-MM-DD or MM/DD/YYYY format"

**Valid Formats:**
- `2026-12-31` ✅ (YYYY-MM-DD)
- `12/31/2026` ✅ (MM/DD/YYYY)
- `2026/12/31` ❌ (Invalid)

### ❌ Duplicate Barcode (in CSV)
**CSV:**
```csv
...barcode...
TEST123
TEST123
```
**Error:** "Barcode TEST123 appears multiple times in CSV"

### ❌ Duplicate Barcode (in Database)
**Action:** Import same CSV twice
**Error:** "Barcode XXX already exists in database"

## Import Modes

### Strict Mode (Default)
- All or nothing
- Blocks import if any errors
- Safest option

### Flexible Mode
- Imports valid rows only
- Skips invalid rows
- Shows success/failed counts

## Known Changes from Original Plan

**Removed Fields:**
- ❌ `contact_phone` - Not in Product model
- ❌ `refund_amount` - Not in Product model

These fields were in the original plan but removed because they don't exist in the Product database schema.

## Database Schema Notes

- `alert_days` is **String** in database (converted automatically)
- `purchase_price` and `sale_price` are **Int** (nullable)
- `barcode` is optional but must be unique if provided
- `unit` is free text, not enum

## API Endpoints

**Preview:**
```
POST http://localhost:3000/products/import/preview
Authorization: Bearer <token>
Content-Type: application/json

{
  "rows": [{ ...product data... }]
}
```

**Confirm:**
```
POST http://localhost:3000/products/import/confirm
Authorization: Bearer <token>
Content-Type: application/json

{
  "rows": [{ ...product data... }],
  "mode": "strict" // or "flexible"
}
```

## Troubleshooting

### "로그인이 필요합니다" alert
- Token name issue
- Fixed: Now checks `erp_access_token` or `token`

### "alert_days: Expected String, provided Int"
- Type mismatch
- Fixed: Auto-converts to string in backend

### "Unknown argument refund_amount"
- Field not in schema
- Fixed: Removed from DTO and service

### Products not appearing after import
- Refresh page (F5)
- Check console for errors
- Verify backend logs

## Success Criteria

✅ Modal opens with template download
✅ CSV file uploads successfully
✅ Validation preview shows correctly
✅ Valid products import to database
✅ Batches created automatically
✅ Products visible on `/inventory/products` page
✅ Strict mode blocks errors
✅ Flexible mode skips invalid rows

## Feature Complete! 🎉

**Status:** Ready for production use
**Last Updated:** 2026-01-17
**Total Fields:** 12 required + 3 optional = 15 columns

