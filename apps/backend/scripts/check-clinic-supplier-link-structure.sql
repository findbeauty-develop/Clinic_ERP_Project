-- Diagnostic query: Check ClinicSupplierLink table structure
-- Run this FIRST to see what columns exist

-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'ClinicSupplierLink'
) AS table_exists;

-- Check all columns in ClinicSupplierLink
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ClinicSupplierLink'
ORDER BY ordinal_position;

-- Check constraints
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'ClinicSupplierLink'::regclass;

