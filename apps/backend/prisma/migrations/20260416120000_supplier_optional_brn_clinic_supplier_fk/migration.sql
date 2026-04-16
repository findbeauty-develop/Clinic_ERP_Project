-- Supplier.business_number: optional (link key is Supplier.id + ClinicSupplierManager.supplier_id)
ALTER TABLE "Supplier" ALTER COLUMN "business_number" DROP NOT NULL;

-- ClinicSupplierManager → Supplier (UUID link for manual / clinic flow)
ALTER TABLE "ClinicSupplierManager" ADD COLUMN IF NOT EXISTS "supplier_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ClinicSupplierManager_supplier_id_fkey'
  ) THEN
    ALTER TABLE "ClinicSupplierManager"
      ADD CONSTRAINT "ClinicSupplierManager_supplier_id_fkey"
      FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ClinicSupplierManager_supplier_id_idx" ON "ClinicSupplierManager"("supplier_id");
