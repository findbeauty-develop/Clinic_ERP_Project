-- CreateTable
CREATE TABLE IF NOT EXISTS "ClinicSupplierLink" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "blocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "ClinicSupplierLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClinicSupplierLink_tenant_id_idx" ON "ClinicSupplierLink"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClinicSupplierLink_supplier_id_idx" ON "ClinicSupplierLink"("supplier_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClinicSupplierLink_status_idx" ON "ClinicSupplierLink"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClinicSupplierLink_tenant_id_status_idx" ON "ClinicSupplierLink"("tenant_id", "status");

-- CreateUniqueConstraint
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicSupplierLink_tenant_id_supplier_id_key" ON "ClinicSupplierLink"("tenant_id", "supplier_id");

-- AddForeignKey (only if constraint doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ClinicSupplierLink_supplier_id_fkey'
    ) THEN
        ALTER TABLE "ClinicSupplierLink" ADD CONSTRAINT "ClinicSupplierLink_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Update Supplier status default to MANUAL_ONLY
ALTER TABLE "Supplier" ALTER COLUMN "status" SET DEFAULT 'MANUAL_ONLY';

-- Update existing suppliers created by clinic to MANUAL_ONLY (if they have tenant_id)
UPDATE "Supplier" SET "status" = 'MANUAL_ONLY' WHERE "status" = 'pending' AND "tenant_id" IS NOT NULL;

-- Update SupplierManager status default to ACTIVE
ALTER TABLE "SupplierManager" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- Update existing active SupplierManagers to ACTIVE
UPDATE "SupplierManager" SET "status" = 'ACTIVE' WHERE "status" = 'pending' AND "password_hash" IS NOT NULL;

