# 📧 Notification Preferences Fix

## 🚨 Problem

When suppliers register on the platform, `receive_sms` and `receive_email` fields were **NULL or false**, causing suppliers to **NOT receive order notifications** even though they registered successfully.

**Example Error:**
```
⚠️ No active managers with SMS enabled found for supplier
```

This created confusion:
- ✅ Manual supplier → Always receives SMS/Email
- ❌ Platform supplier → Doesn't receive anything!

## ✅ Solution

### Default Notification Preferences (Opt-Out Model)

When a supplier registers, **enable notifications by default**:
- ✅ `receive_sms: true` - Receive SMS notifications
- ✅ `receive_email: true` - Receive Email notifications  
- ❌ `receive_kakaotalk: false` - No KakaoTalk (not implemented yet)

Suppliers can **disable notifications later** via settings page.

---

## 📋 Implementation

### Part 1: Code Fix (Already Applied!)

**File**: `apps/supplier-backend/src/modules/manager/manager.service.ts`  
**Location**: Line ~515-527

**Change**: Set default notification preferences when creating SupplierManager:

```typescript
const manager = await tx.supplierManager.create({
  data: {
    // ... existing fields ...
    
    // ✅ DEFAULT NOTIFICATION PREFERENCES
    receive_sms: true,       // Enable by default
    receive_email: true,     // Enable by default
    receive_kakaotalk: false, // Disabled by default
    
    status: "ACTIVE",
    created_by: "self",
  },
});
```

### Part 2: Database Fix (Run Manually)

**File**: `FIX_NOTIFICATION_PREFERENCES.sql`

Fix existing suppliers who already registered without notification preferences.

---

## 🔧 How to Fix Existing Data

### Quick Fix (1 SQL command):

```sql
-- Enable notifications for all active managers
UPDATE "SupplierManager"
SET 
  receive_sms = COALESCE(receive_sms, true),
  receive_email = COALESCE(receive_email, true),
  receive_kakaotalk = COALESCE(receive_kakaotalk, false),
  updated_at = NOW()
WHERE status = 'ACTIVE'
  AND (
    receive_sms IS NULL 
    OR receive_email IS NULL 
    OR receive_kakaotalk IS NULL
  );
```

### Step-by-Step Fix:

1. **Connect to database**:
   ```bash
   psql -h your-host -U your-user -d your-database
   ```

2. **Run the fix**:
   ```bash
   \i apps/supplier-backend/FIX_NOTIFICATION_PREFERENCES.sql
   ```

3. **Review results** after each step

---

## 🧪 Testing

### Test 1: New Supplier Registration

1. **Supplier registers**:
   - Company name, business number, phone, email
   - Complete registration

2. **Check database**:
   ```sql
   SELECT 
     name,
     phone_number,
     receive_sms,
     receive_email
   FROM "SupplierManager"
   WHERE phone_number = '01012345678';
   ```
   
   **Expected**:
   ```
   receive_sms: true   ✅
   receive_email: true ✅
   ```

3. **Clinic creates order** to this supplier

4. **Check supplier receives**:
   - ✅ SMS notification
   - ✅ Email notification
   - ✅ Order visible on supplier frontend

### Test 2: Existing Supplier (After DB Fix)

1. **Run SQL fix** (`FIX_NOTIFICATION_PREFERENCES.sql`)

2. **Check database**:
   ```sql
   SELECT COUNT(*) 
   FROM "SupplierManager"
   WHERE status = 'ACTIVE'
     AND (receive_sms IS NULL OR receive_email IS NULL);
   ```
   
   **Expected**: `0` (all fixed!)

3. **Clinic creates order**

4. **Supplier receives notification** ✅

---

## 📊 Behavior Comparison

### Before Fix:

| Supplier Type | SMS | Email | Notes |
|--------------|-----|-------|-------|
| Manual (not registered) | ✅ Always | ✅ Always | No filter |
| Platform (registered) | ❌ No | ❌ No | `receive_sms: false/NULL` |

**Result**: Platform suppliers don't receive notifications! ❌

### After Fix:

| Supplier Type | SMS | Email | Notes |
|--------------|-----|-------|-------|
| Manual (not registered) | ✅ Always | ✅ Always | No filter |
| Platform (registered) | ✅ Default ON | ✅ Default ON | Can disable later |

**Result**: All suppliers receive notifications! ✅

---

## 🎯 Benefits

1. ✅ **Consistent behavior**: Manual and platform suppliers both receive notifications
2. ✅ **User-friendly**: Suppliers receive orders immediately after registration
3. ✅ **Opt-out model**: Suppliers can disable if they want (via settings page)
4. ✅ **Better UX**: No confusion about "why am I not receiving orders?"
5. ✅ **Business logic**: Default to enabled (notifications are important!)

---

## 🔮 Future: Settings Page

Create a frontend page for suppliers to manage notification preferences:

**Location**: `apps/supplier-frontend/settings/notifications`

**Features**:
- ☑️ Receive SMS notifications
- ☑️ Receive Email notifications
- ☐ Receive KakaoTalk notifications (coming soon)
- ☐ Receive phone call notifications (coming soon)

**API Endpoint**: Already exists in `manager.service.ts`:
```typescript
async updateProfile(supplierManagerId, {
  receive_sms: boolean,
  receive_email: boolean,
  receive_kakaotalk: boolean,
})
```

---

## ✅ Checklist

- [x] Code fix applied (`manager.service.ts`)
- [ ] Database fix run (`FIX_NOTIFICATION_PREFERENCES.sql`)
- [ ] Verification complete (all active managers have preferences set)
- [ ] Test: New supplier registration
- [ ] Test: Supplier receives SMS/Email
- [ ] Test: Supplier can see orders on frontend
- [ ] Future: Settings page for managing preferences

---

**ALL DONE!** 🎉

Run the SQL fix and test it! 🚀

