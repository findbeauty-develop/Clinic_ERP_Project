-- Optional: supplier partial accept quantity reason (per line item)
ALTER TABLE "SupplierTipReturnItem" ADD COLUMN IF NOT EXISTS "quantity_change_reason" TEXT;
