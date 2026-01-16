# Partial Return Acceptance - Testing Guide

## Implementation Summary

All code changes have been successfully implemented for the Partial Return Acceptance feature. This document provides comprehensive testing instructions.

## What Was Implemented

### 1. Database Changes
- ✅ Added 3 new fields to `SupplierReturnNotification` table:
  - `accepted_quantity` (INT) - The quantity supplier actually accepted
  - `unreturned_quantity` (INT) - The quantity supplier couldn't accept
  - `quantity_change_reason` (TEXT) - Reason for quantity difference

### 2. Supplier Backend Changes
- ✅ Modified `acceptReturn` method in `return.service.ts`:
  - Tracks original quantity vs accepted quantity
  - Calculates unreturned quantity
  - Stores reason in memo
  - Sends webhook for "추후반납" items only

- ✅ Added `sendPartialReturnWebhookToClinic` method:
  - Sends unreturned items data to clinic backend
  - Only triggers for "추후반납" reason
  - Includes productId, batchNo, unreturnedQty, and reason

### 3. Clinic Backend Changes
- ✅ Added webhook endpoint `/webhooks/return-partial-acceptance`:
  - Receives partial return data from supplier
  - Protected with API key authentication

- ✅ Implemented `handlePartialReturnAcceptance` method:
  - Processes unreturned items
  - Clears cache to show updated data
  - Logs all operations for monitoring

## Testing Prerequisites

### Environment Setup

1. **Supplier Backend `.env`** must have:
```bash
CLINIC_BACKEND_URL=http://localhost:3000
SUPPLIER_BACKEND_API_KEY=your_clinic_api_key
```

2. **Both backends** must be running:
```bash
# Terminal 1: Clinic Backend
cd apps/backend && npm run start:dev

# Terminal 2: Supplier Backend  
cd apps/supplier-backend && npm run start:dev

# Terminal 3: Clinic Frontend
cd apps/frontend && npm run dev

# Terminal 4: Supplier Frontend
cd apps/supplier-frontend && npm run dev
```

3. **Database migration** must be applied:
```bash
cd apps/backend && npx prisma migrate deploy && npx prisma generate
```

## Manual Testing Scenarios

### Scenario 1: Full Acceptance (Baseline Test)
**Purpose**: Verify normal flow still works

**Steps**:
1. Login to clinic (`http://localhost:3001`)
2. Go to `/returns` page
3. Select a product with empty boxes (e.g., 12 boxes available)
4. Return all 12 boxes to supplier
5. Login to supplier (`http://localhost:3003/returns`)
6. Click "반납 접수" button
7. Accept all 12 boxes (don't change quantity)
8. **Expected Result**: 
   - Supplier shows: Status = "ACCEPTED"
   - Clinic `/returns`: 미반납 수량 remains 0
   - No webhook sent (full acceptance)

---

### Scenario 2: Partial Acceptance with "추후반납" ⭐ (Main Feature)
**Purpose**: Test the core partial return feature

**Steps**:
1. Clinic sends 12 empty boxes
2. On supplier `/returns` page, click "반납 접수"
3. **Change quantity from 12 to 11**
4. Dropdown should appear: "사유를 선택"
5. **Select "추후반납"**
6. Click accept button
7. **Wait 5 seconds** for webhook processing

**Expected Results**:
✅ Supplier side:
- Return status changes to "ACCEPTED"
- Shows accepted_quantity = 11
- Shows unreturned_quantity = 1
- Memo contains "추후반납"

✅ Clinic side:
- Clinic `/returns` page: 미반납 수량 **increases by 1**
- Can create another return for that 1 remaining box
- No error in browser console

✅ Backend logs (check terminal):
- Supplier backend: "Sending partial return webhook..."
- Clinic backend: "Processing partial return acceptance..."
- Clinic backend: "Cleared available products cache..."

---

### Scenario 3: Partial Acceptance with "분실" (Lost)
**Purpose**: Verify non-추후반납 reasons don't restore quantity

**Steps**:
1. Clinic sends 10 boxes
2. Supplier accepts only 8 boxes
3. Select reason: **"분실"**
4. Click accept

**Expected Results**:
✅ Supplier: accepted_quantity = 8, unreturned_quantity = 2, reason = "분실"
✅ Clinic: 미반납 수량 does **NOT** increase (lost boxes are gone)
✅ No webhook sent to clinic

---

### Scenario 4: Partial Acceptance with "초과(전에 재고)"
**Purpose**: Verify excess stock reason

**Steps**:
1. Clinic sends 15 boxes
2. Supplier accepts only 12 boxes
3. Select reason: **"초과(전에 재고)"**
4. Click accept

**Expected Results**:
✅ Supplier: accepted_quantity = 12, unreturned_quantity = 3
✅ Clinic: 미반납 수량 does **NOT** increase
✅ No webhook sent

---

### Scenario 5: Multiple Partial Returns (Sequential)
**Purpose**: Test repeated partial returns

**Steps**:
1. Clinic sends 20 boxes
2. Supplier accepts 15 (reason: "추후반납")
   - **Expected**: 5 boxes return to clinic
3. Verify clinic shows 5 available boxes
4. Clinic sends those 5 boxes again
5. Supplier accepts all 5
   - **Expected**: Clean full acceptance

**Expected Results**:
✅ First return: 15 accepted, 5 restored to clinic
✅ Clinic can return the restored 5 boxes
✅ Second return: All 5 accepted normally
✅ Final 미반납 수량 = 0

---

### Scenario 6: Zero Quantity Rejection (Edge Case)
**Purpose**: Validation test

**Steps**:
1. Clinic sends 10 boxes
2. Supplier changes quantity to **0**
3. Try to accept

**Expected Results**:
✅ Should show validation error (quantity must be > 0)
✅ Acceptance should fail

---

### Scenario 7: Webhook Failure Handling
**Purpose**: Test error resilience

**Steps**:
1. **Stop clinic backend** (`Ctrl+C` in Terminal 1)
2. Clinic sends 12 boxes (while backend is off, this won't work, so start backend)
3. After sending, **stop clinic backend again**
4. Supplier accepts 11 boxes with "추후반납"
5. **Start clinic backend again**
6. Check supplier backend logs

**Expected Results**:
✅ Supplier return still processes successfully
✅ Supplier logs show: "Failed to send partial return webhook"
✅ Return acceptance doesn't fail due to webhook error
✅ When clinic backend restarts, data might be inconsistent (acceptable)

---

### Scenario 8: Multiple Items in Single Return
**Purpose**: Test with multiple products

**Steps**:
1. Clinic returns 2 different products:
   - Product A: 10 boxes
   - Product B: 8 boxes
2. Supplier accepts:
   - Product A: 7 boxes (reason: "추후반납")
   - Product B: 8 boxes (full acceptance)
3. Click accept

**Expected Results**:
✅ Product A: 3 boxes return to clinic's available pool
✅ Product B: 0 boxes return (fully accepted)
✅ Clinic can return those 3 boxes of Product A again

---

## Monitoring & Debugging

### Key Logs to Watch

**Supplier Backend (Terminal 2)**:
```
[ReturnService] Sending partial return webhook for returnId: xxx, unreturned items: 1
[ReturnService] Partial return webhook sent successfully for returnId: xxx
```

**Clinic Backend (Terminal 1)**:
```
[ReturnService] Processing partial return acceptance for returnId: xxx, unreturned items: 1
[ReturnService] Partial return: 1 units of product xxx (batch: xxx) marked as 추후반납
[ReturnService] Cleared available products cache for tenant xxx
```

### Common Issues & Solutions

**Issue**: Clinic 미반납 수량 not updating
**Check**:
1. Is supplier backend sending webhook? (check logs)
2. Is `CLINIC_BACKEND_URL` correct in supplier `.env`?
3. Is `SUPPLIER_BACKEND_API_KEY` correct?
4. Check browser console for cache issues
5. Try hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+F5`)

**Issue**: Dropdown not showing reasons
**Check**:
1. Is quantity changed from original? (dropdown only shows when qty differs)
2. Check supplier frontend code for dropdown logic

**Issue**: Webhook returns 401 Unauthorized
**Check**:
1. Verify `x-api-key` header matches `API_KEY_SECRET` in clinic backend
2. Check `ApiKeyGuard` is properly configured

**Issue**: Database errors
**Check**:
1. Was migration applied? Run: `npx prisma migrate deploy`
2. Was Prisma client regenerated? Run: `npx prisma generate`

## Success Criteria

All scenarios should pass with these results:
- ✅ "추후반납" restores unreturned qty to clinic
- ✅ "분실" and "초과" do NOT restore qty
- ✅ Webhooks send successfully
- ✅ Cache clears and UI updates
- ✅ No errors in any terminal
- ✅ Can perform sequential partial returns

## Rollback Plan

If critical issues are found:

1. **Revert database migration**:
```sql
ALTER TABLE "SupplierReturnNotification" 
  DROP COLUMN "accepted_quantity",
  DROP COLUMN "unreturned_quantity",
  DROP COLUMN "quantity_change_reason";
```

2. **Revert code changes** using git:
```bash
git checkout HEAD -- apps/supplier-backend/src/modules/return/return.service.ts
git checkout HEAD -- apps/backend/src/modules/return/controllers/return.controller.ts
git checkout HEAD -- apps/backend/src/modules/return/services/return.service.ts
git checkout HEAD -- apps/backend/prisma/schema.prisma
```

3. **Regenerate Prisma client**:
```bash
cd apps/backend && npx prisma generate
```

## Next Steps After Testing

1. ✅ Complete all 8 test scenarios
2. ✅ Verify logs show expected behavior
3. ✅ Test with real supplier/clinic users (staging)
4. ✅ Monitor production logs for 24 hours after deployment
5. ✅ Document any edge cases discovered
6. ✅ Update user documentation/training materials

---

**Feature Status**: Implementation Complete ✅  
**Testing Status**: Ready for Manual Testing 🧪  
**Production Ready**: After successful testing ⏳

