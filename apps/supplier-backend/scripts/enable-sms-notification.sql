-- Enable SMS notifications for supplier manager
-- This script enables receive_sms for the supplier manager with ID: 88991fd4-6889-4e1c-ac51-fcdb3f492536

-- Step 1: Check current state
SELECT 
  id,
  name,
  phone_number,
  status,
  receive_sms,
  receive_email,
  receive_kakaotalk
FROM "SupplierManager"
WHERE id = '88991fd4-6889-4e1c-ac51-fcdb3f492536';

-- Step 2: Enable SMS notifications
UPDATE "SupplierManager"
SET receive_sms = true,
    updated_at = NOW()
WHERE id = '88991fd4-6889-4e1c-ac51-fcdb3f492536';

-- Step 3: Verify the change
SELECT 
  id,
  name,
  phone_number,
  status,
  receive_sms,
  receive_email,
  receive_kakaotalk,
  updated_at
FROM "SupplierManager"
WHERE id = '88991fd4-6889-4e1c-ac51-fcdb3f492536';

