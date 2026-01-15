# Partial Order Acceptance - Implementation Guide

## 🎯 Overview

This feature allows suppliers to accept only a subset of items from an order, while leaving the remaining items in pending status. When a partial acceptance occurs, the original order is split into two new orders:

- **Order A** (e.g., `260115491489-A`): Accepted items → Status: `confirmed`
- **Order B** (e.g., `260115491489-B`): Remaining items → Status: `pending`

The original order is archived for record-keeping.

## 🛡️ Safety Measures

### 1. Database Integrity

- **ACID Transactions**: All order splitting happens in a single transaction. If any step fails, the entire operation rolls back automatically.
- **Pre-flight Validation**: Before splitting, the system validates:
  - Selected items belong to the order
  - At least one item remains unselected
  - Total amounts match the original order
- **Post-operation Verification**: After splitting, the system double-checks that amounts are correct.

### 2. Order Number Management

- **Suffix Strategy**: New orders use the original order number with suffixes (A, B)
  - Original: `260115491489`
  - Accepted: `260115491489-A`
  - Remaining: `260115491489-B`
- **Uniqueness Guarantee**: Database unique constraint on `order_no` prevents duplicates

### 3. Amount Calculation

- **Pre-calculation**: System calculates accepted and remaining totals before creating orders
- **Validation**: Ensures `acceptedTotal + remainingTotal === originalTotal`
- **Post-verification**: After creating orders, system re-checks item totals against order totals

### 4. Notification Management

- **Consolidated Webhook**: One notification containing both orders (not two separate notifications)
- **Idempotency Key**: Prevents duplicate webhook processing if network retries occur
- **Structured Payload**: Clear indication that this is an order split event

### 5. Backward Compatibility

- **No Migration Required**: Existing orders work without modification
- **New Fields Optional**: `original_order_id`, `is_split_order`, `split_sequence`, `split_reason` are all nullable
- **Feature Flag**: Easy enable/disable without code changes

## 📋 Database Schema Changes

### SupplierOrder Table

```sql
ALTER TABLE "SupplierOrder"
ADD COLUMN "original_order_id" VARCHAR(36),      -- Points to original order if split
ADD COLUMN "is_split_order" BOOLEAN DEFAULT FALSE, -- True if created from split
ADD COLUMN "split_sequence" INTEGER,              -- 1, 2, 3... for split orders
ADD COLUMN "split_reason" TEXT;                   -- Reason for split

CREATE INDEX "SupplierOrder_original_order_id_idx" ON "SupplierOrder"("original_order_id");
```

### Data Examples

**Original Order** (before split):

```json
{
  "id": "abc-123",
  "order_no": "260115491489",
  "status": "pending",
  "total_amount": 300000,
  "is_split_order": false,
  "items": [
    {
      "id": "item-1",
      "product_name": "제오필",
      "quantity": 2,
      "total_price": 200000
    },
    {
      "id": "item-2",
      "product_name": "리바이브",
      "quantity": 1,
      "total_price": 100000
    }
  ]
}
```

**After Split**:

Order A (Accepted):

```json
{
  "id": "xyz-456",
  "order_no": "260115491489-A",
  "status": "confirmed",
  "total_amount": 200000,
  "original_order_id": "abc-123",
  "is_split_order": true,
  "split_sequence": 1,
  "split_reason": "Partial acceptance - accepted items",
  "items": [
    {
      "id": "item-1",
      "product_name": "제오필",
      "quantity": 2,
      "total_price": 200000
    }
  ]
}
```

Order B (Remaining):

```json
{
  "id": "xyz-789",
  "order_no": "260115491489-B",
  "status": "pending",
  "total_amount": 100000,
  "original_order_id": "abc-123",
  "is_split_order": true,
  "split_sequence": 2,
  "split_reason": "Partial acceptance - remaining items",
  "items": [
    {
      "id": "item-2",
      "product_name": "리바이브",
      "quantity": 1,
      "total_price": 100000
    }
  ]
}
```

Original Order (Archived):

```json
{
  "id": "abc-123",
  "order_no": "260115491489",
  "status": "archived",
  "memo": "Split into 260115491489-A and 260115491489-B",
  "is_split_order": false
}
```

## 🔄 API Specification

### Endpoint: Partial Accept Order

```http
PUT /supplier/orders/:id/partial-accept
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "selectedItemIds": ["item-1", "item-2"],
  "adjustments": [
    {
      "itemId": "item-1",
      "actualQuantity": 2,
      "actualPrice": 100000
    }
  ],
  "memo": "Only accepting these items for now"
}
```

**Request Body**:

- `selectedItemIds` (required): Array of item IDs to accept
- `adjustments` (optional): Price/quantity adjustments
- `memo` (optional): Note for this partial acceptance

**Response** (Success):

```json
{
  "message": "Order split successfully",
  "acceptedOrder": {
    "id": "xyz-456",
    "orderNo": "260115491489-A",
    "status": "confirmed",
    "totalAmount": 200000,
    "items": [...]
  },
  "remainingOrder": {
    "id": "xyz-789",
    "orderNo": "260115491489-B",
    "status": "pending",
    "totalAmount": 100000,
    "items": [...]
  }
}
```

**Error Responses**:

Feature disabled:

```json
{
  "statusCode": 400,
  "message": "Partial order acceptance is not enabled"
}
```

Invalid order state:

```json
{
  "statusCode": 400,
  "message": "Only pending orders can be partially accepted"
}
```

Amount mismatch:

```json
{
  "statusCode": 400,
  "message": "Amount mismatch: 200000 + 90000 !== 300000"
}
```

### Webhook: Order Split Notification

Supplier-backend sends this webhook to clinic-backend after successful split:

```http
POST /order/order-split
X-Api-Key: <api-key>
X-Idempotency-Key: split-abc-123-1234567890
Content-Type: application/json

{
  "type": "order_split",
  "original_order_no": "260115491489",
  "clinic_tenant_id": "clinic_xxx",
  "orders": [
    {
      "order_no": "260115491489-A",
      "status": "confirmed",
      "total_amount": 200000,
      "items": [
        {
          "product_name": "제오필",
          "quantity": 2,
          "total_price": 200000
        }
      ]
    },
    {
      "order_no": "260115491489-B",
      "status": "pending",
      "total_amount": 100000,
      "items": [
        {
          "product_name": "리바이브",
          "quantity": 1,
          "total_price": 100000
        }
      ]
    }
  ]
}
```

## 🎨 Frontend Implementation

### Button Logic

```typescript
// Check if partial selection exists
const selectedInOrder = order.items.filter((item) =>
  selectedItems.has(item.id)
);

// Determine if this is a partial acceptance
const isPartialAcceptance =
  selectedInOrder.length > 0 && selectedInOrder.length < order.items.length;

if (featureEnabled && isPartialAcceptance) {
  // Show confirmation dialog
  const confirmed = confirm(
    `🔀 일부 제품 접수\n\n` +
      `선택: ${selectedInOrder.length}개 → 접수됨\n` +
      `나머지: ${
        order.items.length - selectedInOrder.length
      }개 → 대기 상태 유지\n\n` +
      `주문이 2개로 분할됩니다. 계속하시겠습니까?`
  );

  if (!confirmed) return;

  // Call partial accept API
  await apiPut(`/supplier/orders/${order.id}/partial-accept`, {
    selectedItemIds: selectedInOrder.map((i) => i.id),
  });

  alert(
    "✅ 일부 제품이 접수되었습니다!\n나머지 제품은 대기 상태로 유지됩니다."
  );
} else {
  // Full order acceptance (existing logic)
  // Show modal with all items
}
```

### User Experience

**Before Partial Accept**:

```
┌─────────────────────────────────────┐
│ 주문번호: 260115491489              │
├─────────────────────────────────────┤
│ ☑ 제오필 (2개) - 200,000원         │
│ ☑ 리바이브 (1개) - 100,000원       │
│ ☐ 써큘러 (1개) - 150,000원         │
├─────────────────────────────────────┤
│ [주문 거절]  [주문 접수]            │
└─────────────────────────────────────┘
```

**After Clicking 주문 접수**:

```
⚠️ Confirmation Dialog:
🔀 일부 제품 접수

선택: 2개 → 접수됨
나머지: 1개 → 대기 상태 유지

주문이 2개로 분할됩니다. 계속하시겠습니까?

[취소]  [확인]
```

**After Partial Accept**:

```
✅ 일부 제품이 접수되었습니다!
나머지 제품은 대기 상태로 유지됩니다.

New Orders Created:
┌─────────────────────────────────────┐
│ 주문번호: 260115491489-A            │
│ 상태: 주문 진행 ✅                   │
├─────────────────────────────────────┤
│ 제오필 (2개) - 200,000원            │
│ 리바이브 (1개) - 100,000원          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 주문번호: 260115491489-B            │
│ 상태: 대기 중 ⏳                     │
├─────────────────────────────────────┤
│ 써큘러 (1개) - 150,000원            │
└─────────────────────────────────────┘
```

## 🧪 Testing Guide

### Test Case 1: Full Order Acceptance (No Selection)

**Setup**:

- Order with 3 items
- No items selected via checkbox

**Action**:

- Click "주문 접수"

**Expected**:

- Modal opens with all 3 items
- Normal full acceptance flow
- No order split

### Test Case 2: Partial Order Acceptance

**Setup**:

- Order with 3 items (A, B, C)
- Select items A and B via checkbox

**Action**:

- Click "주문 접수"

**Expected**:

1. Confirmation dialog appears
2. Dialog shows "선택: 2개 → 접수됨, 나머지: 1개 → 대기 상태 유지"
3. After confirmation:
   - Order splits into 2 new orders
   - Order X-A: Items A, B (status: confirmed)
   - Order X-B: Item C (status: pending)
   - Original order: Archived
4. Clinic receives webhook
5. Clinic creates 2 corresponding orders
6. Supplier frontend refreshes and shows 2 orders

### Test Case 3: Amount Validation

**Setup**:

- Manually manipulate request to have incorrect amounts

**Action**:

- Submit partial accept with `acceptedTotal + remainingTotal != originalTotal`

**Expected**:

- Error: "Amount mismatch: 200000 + 90000 !== 300000"
- Transaction rolls back
- Original order unchanged

### Test Case 4: Feature Flag Disabled

**Setup**:

- Set `ENABLE_PARTIAL_ORDER_ACCEPTANCE=false`
- Select 2 out of 3 items

**Action**:

- Click "주문 접수"

**Expected**:

- Warning dialog about full order acceptance
- No partial accept API call
- Full order acceptance happens

### Test Case 5: All Items Selected

**Setup**:

- Order with 3 items
- All 3 items selected

**Action**:

- Click "주문 접수"

**Expected**:

- Error: "Cannot accept all items - use full accept instead"
- Suggests using normal flow without checkboxes

## 🚀 Deployment Guide

### Stage 1: Preparation (Week 1)

1. **Database Backup**:

```bash
pg_dump -h your-host -U your-user -d your-db > backup_$(date +%Y%m%d).sql
```

2. **Run Migration** (Production):

```bash
cd apps/supplier-backend
psql -h your-host -U your-user -d your-db -f prisma/migrations/add_split_order_fields.sql
```

3. **Verify Migration**:

```sql
-- Check if columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'SupplierOrder'
AND column_name IN ('original_order_id', 'is_split_order', 'split_sequence', 'split_reason');

-- Check index
SELECT indexname FROM pg_indexes WHERE tablename = 'supplierorder';
```

### Stage 2: Code Deployment (Week 1)

1. **Deploy with Feature DISABLED**:

```bash
# Production .env
ENABLE_PARTIAL_ORDER_ACCEPTANCE=false
```

2. **Deploy Backend**:

```bash
# Build
cd apps/supplier-backend && pnpm build
cd apps/backend && pnpm build

# Deploy (example with PM2)
pm2 restart supplier-backend
pm2 restart clinic-backend
```

3. **Deploy Frontend**:

```bash
cd apps/supplier-frontend && pnpm build
# Deploy to hosting platform
```

### Stage 3: Testing (Week 2)

1. **Enable on Staging**:

```bash
# Staging .env
ENABLE_PARTIAL_ORDER_ACCEPTANCE=true
```

2. **Manual Testing**:

- Test all 5 test cases above
- Check database records
- Verify webhook delivery
- Test rollback scenarios

3. **Monitor Logs**:

```bash
# Supplier backend
tail -f logs/supplier-backend.log | grep "SPLIT ORDER"

# Clinic backend
tail -f logs/clinic-backend.log | grep "ORDER SPLIT WEBHOOK"
```

### Stage 4: Production Rollout (Week 3)

1. **Gradual Rollout**:

   - Day 1: Enable for internal testing users only
   - Day 3: Enable for 10% of suppliers
   - Day 5: Enable for 50% of suppliers
   - Day 7: Enable for 100% of suppliers

2. **Monitoring Metrics**:

```sql
-- Split order statistics
SELECT
  COUNT(*) as split_orders,
  AVG(total_amount) as avg_amount,
  DATE(created_at) as date
FROM "SupplierOrder"
WHERE is_split_order = TRUE
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Failed splits (check for archived orders without corresponding splits)
SELECT COUNT(*) FROM "SupplierOrder"
WHERE status = 'archived'
AND memo LIKE '%Split into%'
AND created_at > NOW() - INTERVAL '7 days';
```

3. **Red Flags** (trigger rollback if seen):
   - Error rate > 5% on partial-accept endpoint
   - Database deadlocks
   - Amount mismatches
   - Duplicate order numbers
   - Webhook failures > 10%

### Stage 5: Rollback (if needed)

**Emergency Rollback**:

```bash
# 1. Disable feature immediately
ENABLE_PARTIAL_ORDER_ACCEPTANCE=false

# 2. Restart services
pm2 restart all

# 3. Fix any stuck orders manually
```

**Database Cleanup** (if needed):

```sql
-- Find split orders created in last 24 hours
SELECT * FROM "SupplierOrder"
WHERE is_split_order = TRUE
AND created_at > NOW() - INTERVAL '24 hours';

-- If needed, revert to archived order
-- (Manual process - review each case)
```

## 📊 Monitoring & Metrics

### Key Metrics to Track

1. **Split Order Volume**:

```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as splits
FROM "SupplierOrder"
WHERE is_split_order = TRUE
GROUP BY date
ORDER BY date DESC;
```

2. **Success Rate**:

```sql
SELECT
  COUNT(*) FILTER (WHERE status != 'archived') as success_splits,
  COUNT(*) FILTER (WHERE status = 'archived' AND memo NOT LIKE '%Split into%') as failed_splits
FROM "SupplierOrder"
WHERE is_split_order = TRUE;
```

3. **Average Split Size**:

```sql
SELECT
  AVG(split_sequence) as avg_pieces,
  MAX(split_sequence) as max_pieces
FROM "SupplierOrder"
WHERE is_split_order = TRUE;
```

### Alerts to Set Up

- Error rate > 5% on `/partial-accept` endpoint
- Webhook failure rate > 10%
- Database transaction timeout
- Amount mismatch errors
- Duplicate order number attempts

## ❓ FAQ

### Q: What happens if the webhook fails?

**A**: The split still happens on supplier side. Clinic won't see it immediately, but can be retried manually or via cron job. The idempotency key ensures no duplicate processing if webhook is retried.

### Q: Can I split an order more than once?

**A**: Currently no. Once split, the new orders can only be fully accepted or rejected. This prevents complexity and maintains data integrity.

### Q: What if I select all items?

**A**: The system will reject this and suggest using the normal full acceptance flow (without checkboxes).

### Q: Can I adjust prices during partial acceptance?

**A**: Yes, the API supports `adjustments` parameter for per-item price/quantity changes.

### Q: How do I disable this feature?

**A**: Set `ENABLE_PARTIAL_ORDER_ACCEPTANCE=false` in environment variables and restart services. All partial selection logic will be bypassed.

### Q: What happens to the original order?

**A**: It's marked as `archived` status with a memo indicating which orders it was split into. It's preserved for audit/history purposes.

## 📝 Changelog

### Version 1.0.0 (2026-01-15)

- Initial implementation
- ACID transaction support
- Feature flag support
- Webhook integration
- Frontend UI integration
- Comprehensive validation
- Full backward compatibility

---

**Implementation Date**: 2026-01-15  
**Last Updated**: 2026-01-15  
**Status**: ✅ Ready for Testing
