-- ========================================
-- FIX: SupplierManager Notification Preferences
-- ========================================
-- 
-- PROBLEM: When supplier registers, receive_sms and receive_email
-- are NULL or false, so they don't receive order notifications
--
-- SOLUTION: Set default values to true so suppliers receive
-- notifications by default (opt-out model)
-- ========================================

-- ✅ STEP 1: CHECK - Find managers with NULL or false notification settings
SELECT 
  'BEFORE FIX' as status,
  id,
  name,
  phone_number,
  email1,
  status,
  receive_sms,
  receive_email,
  receive_kakaotalk,
  created_at
FROM "SupplierManager"
WHERE status = 'ACTIVE'
  AND (
    receive_sms IS NULL 
    OR receive_email IS NULL 
    OR receive_kakaotalk IS NULL
    OR receive_sms = false
    OR receive_email = false
  )
ORDER BY created_at DESC;

-- ⏸️ PAUSE: Review results. If empty, no fix needed!
-- If you see rows, continue to STEP 2.

-- ========================================

-- ✅ STEP 2: FIX - Set default notification preferences
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

-- Check how many rows updated
-- Expected: Same number as STEP 1

-- ========================================

-- ✅ STEP 3: OPTIONAL - Enable SMS/Email for managers who disabled it
-- (Only run if you want to force enable for everyone)
-- UNCOMMENT to run:
/*
UPDATE "SupplierManager"
SET 
  receive_sms = true,
  receive_email = true,
  updated_at = NOW()
WHERE status = 'ACTIVE'
  AND (receive_sms = false OR receive_email = false);
*/

-- ========================================

-- ✅ STEP 4: VERIFY - Check all fixed
SELECT 
  'AFTER FIX' as status,
  COUNT(*) as total_managers,
  SUM(CASE WHEN receive_sms = true THEN 1 ELSE 0 END) as sms_enabled,
  SUM(CASE WHEN receive_email = true THEN 1 ELSE 0 END) as email_enabled,
  SUM(CASE WHEN receive_kakaotalk = true THEN 1 ELSE 0 END) as kakaotalk_enabled,
  SUM(CASE WHEN receive_sms IS NULL THEN 1 ELSE 0 END) as sms_null,
  SUM(CASE WHEN receive_email IS NULL THEN 1 ELSE 0 END) as email_null
FROM "SupplierManager"
WHERE status = 'ACTIVE';

-- Expected: 
-- - sms_null = 0
-- - email_null = 0
-- - sms_enabled = total_managers (or close to it)
-- - email_enabled = total_managers (or close to it)

-- ========================================

-- ✅ STEP 5: FINAL CHECK - List all active managers
SELECT 
  id,
  name,
  phone_number,
  email1,
  receive_sms,
  receive_email,
  receive_kakaotalk,
  CASE 
    WHEN receive_sms = true AND receive_email = true THEN '✅ FULLY ENABLED'
    WHEN receive_sms = true OR receive_email = true THEN '⚠️ PARTIALLY ENABLED'
    ELSE '❌ DISABLED'
  END as notification_status
FROM "SupplierManager"
WHERE status = 'ACTIVE'
ORDER BY created_at DESC
LIMIT 20;

