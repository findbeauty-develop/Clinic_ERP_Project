-- AlterTable
ALTER TABLE "SupplierManager" 
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ALTER COLUMN "email1" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SupplierManager" 
  ADD COLUMN IF NOT EXISTS "created_by" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierManager_created_by_idx" ON "SupplierManager"("created_by");

