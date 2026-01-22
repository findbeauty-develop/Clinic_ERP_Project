-- Migration already applied via prisma db push
-- AlterTable: Add package_name to PackageItem
ALTER TABLE "PackageItem" ADD COLUMN IF NOT EXISTS "package_name" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PackageOutbound" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "package_name" TEXT,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "package_qty" INTEGER NOT NULL,
    "outbound_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manager_name" TEXT NOT NULL,
    "chart_number" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_damaged" BOOLEAN NOT NULL DEFAULT false,
    "is_defective" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PackageOutbound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PackageOutbound_tenant_id_idx" ON "PackageOutbound"("tenant_id");
CREATE INDEX IF NOT EXISTS "PackageOutbound_package_id_idx" ON "PackageOutbound"("package_id");
CREATE INDEX IF NOT EXISTS "PackageOutbound_product_id_idx" ON "PackageOutbound"("product_id");
CREATE INDEX IF NOT EXISTS "PackageOutbound_batch_id_idx" ON "PackageOutbound"("batch_id");
CREATE INDEX IF NOT EXISTS "PackageOutbound_outbound_date_idx" ON "PackageOutbound"("outbound_date");
CREATE INDEX IF NOT EXISTS "PackageOutbound_tenant_id_outbound_date_idx" ON "PackageOutbound"("tenant_id", "outbound_date");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "PackageOutbound" ADD CONSTRAINT "PackageOutbound_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PackageOutbound" ADD CONSTRAINT "PackageOutbound_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PackageOutbound" ADD CONSTRAINT "PackageOutbound_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
