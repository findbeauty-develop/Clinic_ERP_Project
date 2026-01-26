-- Add unit column to SupplierOrderItem table
ALTER TABLE "SupplierOrderItem" 
ADD COLUMN IF NOT EXISTS "unit" TEXT;

-- Verify the column was added
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns 
-- WHERE table_name = 'SupplierOrderItem' 
--   AND column_name = 'unit';

