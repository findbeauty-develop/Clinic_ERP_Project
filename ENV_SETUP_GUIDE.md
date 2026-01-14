# 🔧 Environment Variables Setup Guide

## Problem: Supplier Rejection Not Updating Clinic Status

**Symptom:** When a supplier rejects an order, the clinic's order page still shows "주문 요청" (pending) instead of "주문 거절" (rejected).

**Root Cause:** Missing API key configuration in `apps/supplier-backend/.env`

---

## 🎯 Solution

### Step 1: Configure Clinic Backend (apps/backend/.env)

Ensure these variables are set:

```bash
# Supplier Backend Integration
SUPPLIER_BACKEND_URL=http://localhost:3002
SUPPLIER_BACKEND_API_KEY=your-secret-api-key-here
```

**Example:**
```bash
SUPPLIER_BACKEND_URL=http://localhost:3002
SUPPLIER_BACKEND_API_KEY=clinic-to-supplier-secret-key-12345
```

---

### Step 2: Configure Supplier Backend (apps/supplier-backend/.env)

Add or update these variables:

```bash
# Clinic Backend Integration (for webhooks)
CLINIC_BACKEND_URL=http://localhost:3000
CLINIC_BACKEND_API_KEY=your-secret-api-key-here
API_KEY_SECRET=your-secret-api-key-here
```

**⚠️ CRITICAL:** 
- `CLINIC_BACKEND_API_KEY` must match `SUPPLIER_BACKEND_API_KEY` from clinic backend
- `API_KEY_SECRET` should be the same as `CLINIC_BACKEND_API_KEY` (fallback)

**Example:**
```bash
CLINIC_BACKEND_URL=http://localhost:3000
CLINIC_BACKEND_API_KEY=clinic-to-supplier-secret-key-12345
API_KEY_SECRET=clinic-to-supplier-secret-key-12345
```

---

### Step 3: Restart Both Backends

```bash
# Terminal 1: Restart clinic-backend
cd apps/backend
# Press Ctrl+C if running
npm run dev

# Terminal 2: Restart supplier-backend
cd apps/supplier-backend
# Press Ctrl+C if running
npm run dev
```

---

## 🧪 Testing

### Test 1: Verify API Key Configuration

After restart, supplier-backend logs should NOT show:
```
❌ WARN [OrderService] API_KEY_SECRET not configured, skipping clinic notification
```

### Test 2: Test Order Rejection Flow

1. Create order from clinic to a **platform supplier** (linked supplier)
2. On supplier platform, click "주문 거절" (Reject Order)
3. Check **supplier-backend logs** for:
   ```
   ✅ [OrderService] ❌ [Order Rejected] Notifying clinic-backend about order {orderNo}
   ```
4. Check **clinic-backend logs** for:
   ```
   ✅ [OrderService] 📝 [updateOrderFromSupplier] Updating order {orderNo} with status: rejected
   ✅ [OrderService] ✅ [updateOrderFromSupplier] Order {orderNo} updated successfully with status: rejected
   ```
5. **Refresh clinic order page** (F5 or switch tabs)
6. Badge should show **"주문 거절"** (red) not "주문 요청" (green)

---

## 🔍 Debugging

### Check if API key is configured:

**Supplier Backend:**
```bash
cd apps/supplier-backend
grep -E "(CLINIC_BACKEND_API_KEY|API_KEY_SECRET)" .env
```

Should output:
```
CLINIC_BACKEND_API_KEY=your-secret-api-key-here
API_KEY_SECRET=your-secret-api-key-here
```

**Clinic Backend:**
```bash
cd apps/backend
grep "SUPPLIER_BACKEND_API_KEY" .env
```

Should output:
```
SUPPLIER_BACKEND_API_KEY=your-secret-api-key-here
```

### Check logs when rejecting order:

**Expected Success Flow:**

1. Supplier-backend logs:
   ```
   [OrderService] 📋 [Order Status Update] Order {orderNo} status changed to: rejected
   [OrderService] ❌ [Order Rejected] Notifying clinic-backend about order {orderNo}
   ```

2. Clinic-backend logs:
   ```
   [OrderService] 📝 [updateOrderFromSupplier] Updating order {orderNo} with status: rejected
   [OrderService] ✅ [updateOrderFromSupplier] Order {orderNo} updated successfully with status: rejected
   ```

**Error Indicators:**

- ❌ `WARN API_KEY_SECRET not configured` → API key missing in supplier-backend
- ❌ `401 Unauthorized` → API keys don't match between backends
- ❌ `Failed to notify clinic-backend` → Network issue or wrong URL

---

## 📋 Quick Reference

| Backend | Environment Variable | Purpose |
|---------|---------------------|---------|
| Clinic | `SUPPLIER_BACKEND_URL` | URL to supplier backend |
| Clinic | `SUPPLIER_BACKEND_API_KEY` | API key for webhooks TO supplier |
| Supplier | `CLINIC_BACKEND_URL` | URL to clinic backend |
| Supplier | `CLINIC_BACKEND_API_KEY` | API key for webhooks TO clinic ⚠️ Must match clinic's `SUPPLIER_BACKEND_API_KEY` |
| Supplier | `API_KEY_SECRET` | Fallback for `CLINIC_BACKEND_API_KEY` |

---

## ✅ Verification Checklist

- [ ] Both `.env` files have API keys configured
- [ ] API keys match between clinic and supplier backends
- [ ] Both backends restarted after configuration
- [ ] No "API_KEY_SECRET not configured" warnings in logs
- [ ] Order rejection sends webhook to clinic-backend
- [ ] Clinic-backend updates order status to "rejected"
- [ ] Clinic frontend shows "주문 거절" badge after refresh

---

**Created:** 2026-01-14  
**Issue:** Supplier rejection webhook not working  
**Fix:** Configure `CLINIC_BACKEND_API_KEY` in supplier-backend `.env`
