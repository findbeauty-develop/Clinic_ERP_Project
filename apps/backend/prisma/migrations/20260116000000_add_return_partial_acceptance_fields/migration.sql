-- Add new fields to SupplierReturnNotification for partial return acceptance
ALTER TABLE "SupplierReturnNotification" 
  ADD COLUMN "accepted_quantity" INTEGER,
  ADD COLUMN "unreturned_quantity" INTEGER,
  ADD COLUMN "quantity_change_reason" TEXT;

